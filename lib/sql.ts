/**
 * Async worker thread wrapper around SQLite, written to improve concurrent performance.
 * @author mia-pi-git
 */
import {QueryProcessManager} from './process-manager';
import type * as sqlite from 'better-sqlite3';
import {FS} from './fs';
// @ts-ignore in case not installed
import type {SQLStatement} from 'sql-template-strings';

export const DB_NOT_FOUND = null;

export interface SQLOptions {
	file: string;
	/** file to import database functions from - this should be relative to this filename. */
	extension?: string;
	/** options to be passed to better-sqlite3 */
	sqliteOptions?: sqlite.Options;
}

type DataType = unknown[] | Record<string, unknown>;
export type SQLInput = string | number | null;
export interface ResultRow {[k: string]: SQLInput}

export interface TransactionEnvironment {
	db: sqlite.Database;
	statements: Map<string, sqlite.Statement>;
}

type DatabaseQuery = {
	/** Prepare a statement - data is the statement. */
	type: 'prepare', data: string,
} | {
	/** Get all lines from a statement. Data is the params. */
	type: 'all', data: DataType, statement: string, noPrepare?: boolean,
} | {
	/** Execute raw SQL in the database. */
	type: "exec", data: string,
} | {
	/** Get one line from a prepared statement. */
	type: 'get', data: DataType, statement: string, noPrepare?: boolean,
} | {
	/** Run a prepared statement. */
	type: 'run', data: DataType, statement: string, noPrepare?: boolean,
} | {
	type: 'transaction', name: string, data: DataType,
} | {
	type: 'start', options: SQLOptions,
} | {
	type: 'load-extension', data: string,
};

type ErrorHandler = (error: Error, data: DatabaseQuery) => void;

function getModule() {
	try {
		return require('better-sqlite3') as typeof sqlite.default;
	} catch {
		return null;
	}
}

export class Statement<R extends DataType> {
	private db: SQLDatabaseManager;
	private statement: string;
	constructor(statement: string, db: SQLDatabaseManager) {
		this.db = db;
		this.statement = statement;
	}
	run(data: R) {
		return this.db.run(this.statement, data);
	}
	all(data: R) {
		return this.db.all(this.statement, data);
	}
	get(data: R) {
		return this.db.get(this.statement, data);
	}
	toString() {
		return this.statement;
	}
	toJSON() {
		return this.statement;
	}
}

export class SQLDatabaseManager extends QueryProcessManager<DatabaseQuery, any> {
	options: SQLOptions;
	database: null | sqlite.Database = null;
	state: {
		transactions: Map<string, sqlite.Transaction>,
		statements: Map<string, sqlite.Statement>,
	};
	private dbReady = false;
	onError: ErrorHandler;
	constructor(module: NodeJS.Module, options: SQLOptions, onError?: ErrorHandler) {
		super(module, query => {
			if (!this.dbReady) {
				this.setupDatabase();
			}
			try {
				switch (query.type) {
				case 'load-extension': {
					if (!this.database) return null;
					this.loadExtensionFile(query.data);
					return true;
				}
				case 'transaction': {
					const transaction = this.state.transactions.get(query.name);
					// !transaction covers db not existing, typically, but this is just to appease ts
					if (!transaction || !this.database) {
						return null;
					}
					const env: TransactionEnvironment = {
						db: this.database,
						statements: this.state.statements,
					};
					return transaction(query.data, env) || null;
				}
				case 'exec': {
					if (!this.database) return {changes: 0};
					this.database.exec(query.data);
					return true;
				}
				case 'get': {
					if (!this.database) {
						return null;
					}
					return this.extractStatement(query).get(query.data);
				}
				case 'run': {
					if (!this.database) {
						return null;
					}
					return this.extractStatement(query).run(query.data);
				}
				case 'all': {
					if (!this.database) {
						return null;
					}
					return this.extractStatement(query).all(query.data);
				}
				case 'prepare':
					if (!this.database) {
						return null;
					}
					this.state.statements.set(query.data, this.database.prepare(query.data));
					return query.data;
				}
			} catch (error: any) {
				return this.onError(error, query);
			}
		});

		this.options = options;
		this.onError = onError || ((err, query) => {
			if (global.Monitor?.crashlog) {
				Monitor.crashlog(err, `an ${this.basename} SQLite process`, query);
				return null;
			}
			throw new Error(`SQLite error: ${err.message} (${JSON.stringify(query)})`);
		});
		this.state = {
			transactions: new Map(),
			statements: new Map(),
		};
		if (!this.isParentProcess) this.setupDatabase();
	}
	private cacheStatement(source: string) {
		source = source.trim();
		let statement = this.state.statements.get(source);
		if (!statement) {
			statement = this.database!.prepare(source);
			this.state.statements.set(source, statement);
		}
		return statement;
	}
	private extractStatement(
		query: DatabaseQuery & {statement: string, noPrepare?: boolean}
	) {
		query.statement = query.statement.trim();
		const statement = query.noPrepare ?
			this.state.statements.get(query.statement) :
			this.cacheStatement(query.statement);
		if (!statement) throw new Error(`Missing cached statement "${query.statement}" where required`);
		return statement;
	}
	setupDatabase() {
		if (this.dbReady) return;
		this.dbReady = true;
		const {file, extension} = this.options;
		const Database = getModule();
		this.database = Database ? new Database(file) : null;
		if (extension) this.loadExtensionFile(extension);
	}

	loadExtensionFile(extension: string) {
		if (!this.database) return;
		const {
			functions,
			transactions: storedTransactions,
			statements: storedStatements,
			onDatabaseStart,
			// eslint-disable-next-line @typescript-eslint/no-var-requires
		} = require(`../${extension}`);
		if (functions) {
			for (const k in functions) {
				this.database.function(k, functions[k]);
			}
		}
		if (storedTransactions) {
			for (const t in storedTransactions) {
				const transaction = this.database.transaction(storedTransactions[t]);
				this.state.transactions.set(t, transaction);
			}
		}
		if (storedStatements) {
			for (const k in storedStatements) {
				const statement = this.database.prepare(storedStatements[k]);
				this.state.statements.set(statement.source, statement);
			}
		}
		if (onDatabaseStart) {
			onDatabaseStart(this.database);
		}
	}
	all<T = any>(
		statement: string | Statement, data: DataType = [], noPrepare?: boolean
	): Promise<T[]> {
		if (typeof statement !== 'string') statement = statement.toString();
		return this.query({type: 'all', statement, data, noPrepare});
	}
	get<T = any>(
		statement: string | Statement, data: DataType = [], noPrepare?: boolean
	): Promise<T> {
		if (typeof statement !== 'string') statement = statement.toString();
		return this.query({type: 'get', statement, data, noPrepare});
	}
	run(
		statement: string | Statement, data: DataType = [], noPrepare?: boolean
	): Promise<sqlite.RunResult> {
		if (typeof statement !== 'string') statement = statement.toString();
		return this.query({type: 'run', statement, data, noPrepare});
	}
	transaction<T = any>(name: string, data: DataType = []): Promise<T> {
		return this.query({type: 'transaction', name, data});
	}
	async prepare(statement: string): Promise<Statement | null> {
		const source = await this.query({type: 'prepare', data: statement});
		if (!source) return null;
		return new Statement(source, this);
	}
	exec(data: string): Promise<{changes: number}> {
		return this.query({type: 'exec', data});
	}
	loadExtension(filepath: string) {
		return this.query({type: 'load-extension', data: filepath});
	}

	async runFile(file: string) {
		const contents = await FS(file).read();
		return this.query({type: 'exec', data: contents});
	}
}

export const tables = new Map<string, DatabaseTable<any>>();

export class DatabaseTable<T> {
	database: SQLDatabaseManager;
	name: string;
	primaryKeyName: string;
	constructor(
		name: string,
		primaryKeyName: string,
		database: SQLDatabaseManager
	) {
		this.name = name;
		this.database = database;
		this.primaryKeyName = primaryKeyName;
		tables.set(this.name, this);
	}
	private SQL: typeof import('sql-template-strings').SQL = (() => {
		try {
			return require('sql-template-strings');
		} catch {
			return () => {
				throw new Error("Using SQL-template-strings without it installed");
			};
		}
	})();
	async selectOne(
		entries: string | string[],
		where?: SQLStatement
	): Promise<T | null> {
		const query = where || this.SQL``;
		query.append(' LIMIT 1');
		const rows = await this.selectAll(entries, query);
		return rows?.[0] || null;
	}
	selectAll(
		entries: string | string[],
		where?: SQLStatement
	): Promise<T[]> {
		const query = this.SQL`SELECT `;
		if (typeof entries === 'string') {
			query.append(' * ');
		} else {
			for (let i = 0; i < entries.length; i++) {
				query.append(entries[i]);
				if (typeof entries[i + 1] !== 'undefined') query.append(', ');
			}
			query.append(' ');
		}
		query.append(`FROM ${this.name} `);
		if (where) {
			query.append(' WHERE ');
			query.append(where);
		}
		return this.all(query);
	}
	get(entries: string | string[], keyId: SQLInput) {
		const query = this.SQL``;
		query.append(this.primaryKeyName);
		query.append(this.SQL` = ${keyId}`);
		return this.selectOne(entries, query);
	}
	updateAll(toParams: Partial<T>, where?: SQLStatement, limit?: number) {
		const to = Object.entries(toParams);
		const query = this.SQL`UPDATE `;
		query.append(this.name + ' SET ');
		for (let i = 0; i < to.length; i++) {
			const [k, v] = to[i];
			query.append(`${k} = `);
			query.append(this.SQL`${v}`);
			if (typeof to[i + 1] !== 'undefined') {
				query.append(', ');
			}
		}

		if (where) {
			query.append(` WHERE `);
			query.append(where);
		}
		if (limit) query.append(this.SQL` LIMIT ${limit}`);
		return this.run(query);
	}
	updateOne(to: Partial<T>, where?: SQLStatement) {
		return this.updateAll(to, where, 1);
	}
	deleteAll(where?: SQLStatement, limit?: number) {
		const query = this.SQL`DELETE FROM `;
		query.append(this.name);
		if (where) {
			query.append(' WHERE ');
			query.append(where);
		}
		if (limit) {
			query.append(this.SQL` LIMIT ${limit}`);
		}
		return this.run(query);
	}
	delete(keyEntry: SQLInput) {
		const query = this.SQL``;
		query.append(this.primaryKeyName);
		query.append(this.SQL` = ${keyEntry}`);
		return this.deleteOne(query);
	}
	deleteOne(where: SQLStatement) {
		return this.deleteAll(where, 1);
	}
	insert(colMap: Partial<T>, rest?: SQLStatement, isReplace = false) {
		const query = this.SQL``;
		query.append(`${isReplace ? 'REPLACE' : 'INSERT'} INTO ${this.name} (`);
		const keys = Object.keys(colMap);
		for (let i = 0; i < keys.length; i++) {
			query.append(keys[i]);
			if (typeof keys[i + 1] !== 'undefined') query.append(', ');
		}
		query.append(') VALUES (');
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			query.append(this.SQL`${colMap[key as keyof T]}`);
			if (typeof keys[i + 1] !== 'undefined') query.append(', ');
		}
		query.append(') ');
		if (rest) query.append(rest);
		return this.database.run(query.sql, query.values);
	}
	replace(cols: Partial<T>, rest?: SQLStatement) {
		return this.insert(cols, rest, true);
	}
	update(primaryKey: SQLInput, data: Partial<T>) {
		const query = this.SQL``;
		query.append(this.primaryKeyName + ' = ');
		query.append(this.SQL`${primaryKey}`);
		return this.updateOne(data, query);
	}

	// catch-alls for "we can't fit this query into any of the wrapper functions"
	run(sql: SQLStatement) {
		return this.database.run(sql.sql, sql.values) as Promise<{changes: number}>;
	}
	all(sql: SQLStatement) {
		return this.database.all(sql.sql, sql.values) as Promise<T[]>;
	}
}

interface SetupOptions {
	onError: ErrorHandler;
	processes: number;
}

function getSQL(
	module: NodeJS.Module, input: SQLOptions & Partial<SetupOptions>
) {
	const {onError, processes} = input;
	for (const k of ['onError', 'processes'] as const) delete input[k];
	const PM = new SQLDatabaseManager(module, input, onError);
	if (PM.isParentProcess) {
		if (processes) PM.spawn(processes);
	}
	return PM;
}

export const SQL = Object.assign(getSQL, {
	DatabaseTable,
	SQLDatabaseManager,
	tables,
});

export namespace SQL {
	export type DatabaseManager = import('./sql').SQLDatabaseManager;
	export type Statement = import('./sql').Statement;
	export type Options = import('./sql').SQLOptions;
	export type DatabaseTable<T> = import('./sql').DatabaseTable<T>;
}
