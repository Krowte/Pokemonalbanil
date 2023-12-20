/**
 * Not a chat plugin.
 *
 * Handles updating the level database for [Gen 9] Computer-Generated Teams.
 */

import {SQL} from "../../lib";
import {getSpeciesName} from "./randombattles/winrates";

export let addPokemon: SQL.Statement | null = null;
export let incrementWins: SQL.Statement | null = null;
export let incrementLosses: SQL.Statement | null = null;
export let dbSetupPromise: Promise<void> | null = null;

async function setupDatabase(database: SQL.DatabaseManager) {
	await database.runFile('./databases/schemas/battlestats.sql');
	addPokemon = await database.prepare(
		'INSERT OR IGNORE INTO gen9computergeneratedteams (species_id, wins, losses, level) VALUES (?, 0, 0, ?)'
	);
	incrementWins = await database.prepare(
		'UPDATE gen9computergeneratedteams SET wins = wins + 1 WHERE species_id = ?'
	);
	incrementLosses = await database.prepare(
		'UPDATE gen9computergeneratedteams SET losses = losses + 1 WHERE species_id = ?'
	);
}

if (Config.usesqlite && Config.usesqliteleveling) {
	const database = SQL(module, {
		file: './databases/battlestats.db',
	});
	dbSetupPromise = setupDatabase(database);
}

async function updateStats(battle: RoomBattle, winner: ID) {
	if (!incrementWins || !incrementLosses) await dbSetupPromise;
	if (toID(battle.format) !== 'gen9computergeneratedteams') return;
	// if the game is rated or part of a tournament hosted by a public room, it counts
	if (battle.rated === 1 && battle.room.parent?.game) {
		let parent = battle.room.parent;
		if (parent.game!.gameid === 'bestof' && parent.parent?.game) parent = parent.parent;
		if (parent.game!.gameid !== 'tournament' || parent.settings.isPrivate) return;
	} else if (battle.rated < 1000) {
		return;
	}

	const p1 = Users.get(battle.p1.name);
	const p2 = Users.get(battle.p2.name);
	if (!p1 || !p2) return;

	const p1team = await battle.getTeam(p1);
	const p2team = await battle.getTeam(p2);
	if (!p1team || !p2team) return;

	let loserTeam, winnerTeam;
	if (winner === p1.id) {
		loserTeam = p2team;
		winnerTeam = p1team;
	} else {
		loserTeam = p1team;
		winnerTeam = p2team;
	}

	for (const set of winnerTeam) {
		const statsSpecies = getSpeciesName(set, Dex.formats.get(battle.format));
		await addPokemon?.run([toID(statsSpecies), set.level]);
		await incrementWins?.run([toID(statsSpecies)]);
	}
	for (const set of loserTeam) {
		const statsSpecies = getSpeciesName(set, Dex.formats.get(battle.format));
		await addPokemon?.run([toID(statsSpecies), set.level]);
		await incrementLosses?.run([toID(statsSpecies)]);
	}
}

export const handlers: Chat.Handlers = {
	onBattleEnd(battle, winner) {
		if (!Config.usesqlite || !Config.usesqliteleveling) return;
		void updateStats(battle, winner);
	},
};
