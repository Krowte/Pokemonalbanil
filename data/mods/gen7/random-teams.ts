import {MoveCounter, TeamData} from '../gen8/random-teams';
import {RandomGen7DoublesTeams} from './random-doubles-teams';
import {PRNG, PRNGSeed} from '../../../sim/prng';
import {Utils} from '../../../lib';
import {toID} from '../../../sim/dex';

export interface BattleFactorySpecies {
	flags: {megaOnly?: 1, zmoveOnly?: 1, limEevee?: 1};
	sets: BattleFactorySet[];
}
interface BattleFactorySet {
	species: string;
	item: string;
	ability: string;
	nature: string;
	moves: string[];
	evs?: Partial<StatsTable>;
	ivs?: Partial<StatsTable>;
}

const ZeroAttackHPIVs: {[k: string]: SparseStatsTable} = {
	grass: {hp: 30, spa: 30},
	fire: {spa: 30, spe: 30},
	ice: {def: 30},
	ground: {spa: 30, spd: 30},
	fighting: {def: 30, spa: 30, spd: 30, spe: 30},
	electric: {def: 30, spe: 30},
	psychic: {spe: 30},
	flying: {spa: 30, spd: 30, spe: 30},
	rock: {def: 30, spd: 30, spe: 30},
};

// Moves that restore HP:
const RecoveryMove = [
	'healorder', 'milkdrink', 'moonlight', 'morningsun', 'recover', 'recycle', 'roost', 'shoreup', 'slackoff', 'softboiled', 'strengthsap', 'synthesis',
];
// Moves that drop stats:
const ContraryMoves = [
	'closecombat', 'leafstorm', 'overheat', 'superpower', 'vcreate',
];
// Moves that boost Attack:
const PhysicalSetup = [
	'bellydrum', 'bulkup', 'coil', 'curse', 'dragondance', 'honeclaws', 'howl', 'meditate', 'poweruppunch', 'screech', 'swordsdance',
];
// Moves which boost Special Attack:
const SpecialSetup = [
	'calmmind', 'chargebeam', 'geomancy', 'nastyplot', 'quiverdance', 'tailglow',
];
// Moves that boost Attack AND Special Attack:
const MixedSetup = [
	'celebrate', 'growth', 'happyhour', 'holdhands', 'shellsmash', 'workup',
];
// Some moves that only boost Speed:
const SpeedSetup = [
	'agility', 'autotomize', 'flamecharge', 'rockpolish',
];
// Conglomerate for ease of access
const Setup = [
	'acidarmor', 'agility', 'autotomize', 'bellydrum', 'bulkup', 'calmmind', 'celebrate', 'coil', 'conversion', 'curse', 'dragondance',
	'electricterrain', 'flamecharge', 'focusenergy', 'geomancy', 'growth', 'happyhour', 'holdhands', 'honeclaws', 'howl', 'irondefense', 'meditate',
	'nastyplot', 'poweruppunch', 'quiverdance', 'raindance', 'rockpolish', 'shellsmash', 'shiftgear', 'swordsdance', 'tailglow', 'workup',
];
// Moves that shouldn't be the only STAB moves:
const NoStab = [
	'accelerock', 'aquajet', 'bulletpunch', 'clearsmog', 'dragontail', 'eruption', 'explosion',
	'fakeout', 'firstimpression', 'flamecharge', 'futuresight', 'iceshard', 'icywind', 'incinerate', 'machpunch', 'nuzzle',
	'pluck', 'pursuit', 'quickattack', 'rapidspin', 'reversal', 'selfdestruct', 'shadowsneak', 'skyattack', 'skydrop',
	'snarl', 'suckerpunch', 'uturn', 'watershuriken', 'vacuumwave', 'voltswitch', 'waterspout',
];
// Hazard-setting moves
const Hazards = [
	'spikes', 'stealthrock', 'stickyweb', 'toxicspikes',
];
// Protect and its variants
const ProtectMove = [
	'banefulbunker', 'kingsshield', 'protect', 'spikyshield',
];

// Moves that should be paired together when possible
const MovePairs = [
	['lightscreen', 'reflect'],
	['sleeptalk', 'rest'],
	['protect', 'wish'],
	['spikyshield', 'wish'],
	['leechseed', 'substitute'],
	['perishsong', 'protect'],
	['solarbeam', 'sunnyday'],
];

/** Pokemon who always want priority STAB, and are fine with it as its only STAB move of that type */
const priorityPokemon = [
	'aegislashblade', 'banette', 'breloom', 'cacturne', 'doublade', 'dusknoir', 'golisopod', 'honchkrow', 'mimikyu', 'scizor', 'scizormega', 'shedinja',
];
function sereneGraceBenefits(move: Move) {
	return move.secondary?.chance && move.secondary.chance >= 20 && move.secondary.chance < 100;
}

export class RandomGen7Teams extends RandomGen7DoublesTeams {
	randomSets: AnyObject = require('./random-sets.json');

	constructor(format: Format | string, prng: PRNG | PRNGSeed | null) {
		super(format, prng);

		if (this.format.gameType === 'singles') this.noStab = NoStab;

		this.moveEnforcementCheckers = (this.format.gameType !== 'singles') ? this.moveEnforcementCheckers : {
			Bug: (movePool, moves, abilities, types, counter) => (
				['megahorn', 'pinmissile'].some(m => movePool.includes(m)) ||
				!counter.get('Bug') && (abilities.has('Tinted Lens') || abilities.has('Adaptability'))
			),
			Dark: (movePool, moves, abilities, types, counter) => !counter.get('Dark'),
			Dragon: (movePool, moves, abilities, types, counter) => !counter.get('Dragon') && !abilities.has('Aerilate'),
			Electric: (movePool, moves, abilities, types, counter) => !counter.get('Electric'),
			Fairy: (movePool, moves, abilities, types, counter) => !counter.get('Fairy'),
			Fighting: (movePool, moves, abilities, types, counter) => !counter.get('Fighting'),
			Fire: (movePool, moves, abilities, types, counter) => !counter.get('Fire'),
			Flying: (movePool, moves, abilities, types, counter, species) => (
				!counter.get('Flying') && ['aerodactylmega', 'charizardmega', 'mantine'].every(m => species.id !== m) &&
				!movePool.includes('hiddenpowerflying')
			),
			Ghost: (movePool, moves, abilities, types, counter) => !counter.get('Ghost'),
			Grass: (movePool, moves, abilities, types, counter, species) => (
				!counter.get('Grass') && (species.baseStats.atk >= 100 || movePool.includes('leafstorm'))
			),
			Ground: (movePool, moves, abilities, types, counter) => !counter.get('Ground'),
			Ice: (movePool, moves, abilities, types, counter) => (
				!counter.get('Ice') || movePool.includes('blizzard') ||
				abilities.has('Refrigerate') && (movePool.includes('return') || movePool.includes('hypervoice'))
			),
			Normal: movePool => movePool.includes('boomburst'),
			Poison: (movePool, moves, abilities, types, counter) => !counter.get('Poison'),
			Psychic: (movePool, moves, abilities, types, counter) => (
				!counter.get('Psychic') && (
					types.has('Fighting') || movePool.includes('psychicfangs') || movePool.includes('calmmind')
				)
			),
			Rock: (movePool, moves, abilities, types, counter, species) => (
				!counter.get('Rock') && (species.baseStats.atk >= 100 || abilities.has('Rock Head'))
			),
			Steel: (movePool, moves, abilities, types, counter, species) => (
				!counter.get('Steel') && species.baseStats.atk >= 100
			),
			Water: (movePool, moves, abilities, types, counter) => !counter.get('Water'),
		};
	}

	newQueryMoves(
		moves: Set<string> | null,
		species: Species,
		preferredType: string,
		abilities: Set<string> = new Set(),
	): MoveCounter {
		// This is primarily a helper function for random setbuilder functions.
		const counter = new MoveCounter();
		const types = species.types;
		if (!moves?.size) return counter;

		const categories = {Physical: 0, Special: 0, Status: 0};

		// Iterate through all moves we've chosen so far and keep track of what they do:
		for (const moveid of moves) {
			const move = this.dex.moves.get(moveid);

			const moveType = this.getMoveType(move, species, abilities, preferredType);
			if (move.damage || move.damageCallback) {
				// Moves that do a set amount of damage:
				counter.add('damage');
				counter.damagingMoves.add(move);
			} else {
				// Are Physical/Special/Status moves:
				categories[move.category]++;
			}
			// Moves that have a low base power:
			if (moveid === 'lowkick' || (move.basePower && move.basePower <= 60 && moveid !== 'rapidspin')) {
				counter.add('technician');
			}
			// Moves that hit up to 5 times:
			if (move.multihit && Array.isArray(move.multihit) && move.multihit[1] === 5) counter.add('skilllink');
			if (move.recoil || move.hasCrashDamage) counter.add('recoil');
			if (move.drain) counter.add('drain');
			// Moves which have a base power:
			if (move.basePower || move.basePowerCallback) {
				if (!this.noStab.includes(moveid) || priorityPokemon.includes(species.id) && move.priority > 0) {
					counter.add(moveType);
					if (types.includes(moveType)) counter.add('stab');
					if (preferredType === moveType) counter.add('preferred');
					counter.damagingMoves.add(move);
				}
				if (move.flags['bite']) counter.add('strongjaw');
				if (move.flags['punch']) counter.add('ironfist');
				if (move.flags['sound']) counter.add('sound');
				if (move.priority > 0 || (moveid === 'grassyglide' && abilities.has('Grassy Surge'))) {
					counter.add('priority');
				}
			}
			// Moves with secondary effects:
			if (move.secondary || move.hasSheerForce) {
				counter.add('sheerforce');
				if (sereneGraceBenefits(move)) {
					counter.add('serenegrace');
				}
			}
			// Moves with low accuracy:
			if (move.accuracy && move.accuracy !== true && move.accuracy < 90) counter.add('inaccurate');

			// Moves that change stats:
			if (RecoveryMove.includes(moveid)) counter.add('recovery');
			if (ContraryMoves.includes(moveid)) counter.add('contrary');
			if (PhysicalSetup.includes(moveid)) counter.add('physicalsetup');
			if (SpecialSetup.includes(moveid)) counter.add('specialsetup');
			if (MixedSetup.includes(moveid)) counter.add('mixedsetup');
			if (SpeedSetup.includes(moveid)) counter.add('speedsetup');
			if (Setup.includes(moveid)) counter.add('setup');
			if (Hazards.includes(moveid)) counter.add('hazards');
		}

		counter.set('Physical', Math.floor(categories['Physical']));
		counter.set('Special', Math.floor(categories['Special']));
		counter.set('Status', categories['Status']);
		return counter;
	}

	cullMovePool(
		types: string[],
		moves: Set<string>,
		abilities: Set<string>,
		counter: MoveCounter,
		movePool: string[],
		teamDetails: RandomTeamsTypes.TeamDetails,
		species: Species,
		isLead: boolean,
		isDoubles: boolean,
		preferredType: string,
		role: string,
	): void {
		// Pokemon cannot have multiple Hidden Powers in any circumstance
		let hasHiddenPower = false;
		for (const move of moves) {
			if (move.startsWith('hiddenpower')) hasHiddenPower = true;
		}
		if (hasHiddenPower) {
			let movePoolHasHiddenPower = true;
			while (movePoolHasHiddenPower) {
				movePoolHasHiddenPower = false;
				for (const moveid of movePool) {
					if (moveid.startsWith('hiddenpower')) {
						this.fastPop(movePool, movePool.indexOf(moveid));
						movePoolHasHiddenPower = true;
						break;
					}
				}
			}
		}

		if (moves.size + movePool.length <= this.maxMoveCount) return;
		// If we have two unfilled moves and only one unpaired move, cull the unpaired move.
		if (moves.size === this.maxMoveCount - 2) {
			const unpairedMoves = [...movePool];
			for (const pair of MovePairs) {
				if (movePool.includes(pair[0]) && movePool.includes(pair[1])) {
					this.fastPop(unpairedMoves, unpairedMoves.indexOf(pair[0]));
					this.fastPop(unpairedMoves, unpairedMoves.indexOf(pair[1]));
				}
			}
			if (unpairedMoves.length === 1) {
				this.fastPop(movePool, movePool.indexOf(unpairedMoves[0]));
			}
		}

		// These moves are paired, and shouldn't appear if there is not room for them both.
		if (moves.size === this.maxMoveCount - 1) {
			for (const pair of MovePairs) {
				if (movePool.includes(pair[0]) && movePool.includes(pair[1])) {
					this.fastPop(movePool, movePool.indexOf(pair[0]));
					this.fastPop(movePool, movePool.indexOf(pair[1]));
				}
			}
		}

		// Team-based move culls
		if (teamDetails.screens && movePool.length >= this.maxMoveCount + 2) {
			if (movePool.includes('reflect')) this.fastPop(movePool, movePool.indexOf('reflect'));
			if (movePool.includes('lightscreen')) this.fastPop(movePool, movePool.indexOf('lightscreen'));
			if (moves.size + movePool.length <= this.maxMoveCount) return;
		}
		if (teamDetails.stickyWeb) {
			if (movePool.includes('stickyweb')) this.fastPop(movePool, movePool.indexOf('stickyweb'));
			if (moves.size + movePool.length <= this.maxMoveCount) return;
		}
		if (teamDetails.stealthRock) {
			if (movePool.includes('stealthrock')) this.fastPop(movePool, movePool.indexOf('stealthrock'));
			if (moves.size + movePool.length <= this.maxMoveCount) return;
		}
		if (teamDetails.defog || teamDetails.rapidSpin) {
			if (movePool.includes('defog')) this.fastPop(movePool, movePool.indexOf('defog'));
			if (movePool.includes('rapidspin')) this.fastPop(movePool, movePool.indexOf('rapidspin'));
			if (moves.size + movePool.length <= this.maxMoveCount) return;
		}
		if (teamDetails.toxicSpikes) {
			if (movePool.includes('toxicspikes')) this.fastPop(movePool, movePool.indexOf('toxicspikes'));
			if (moves.size + movePool.length <= this.maxMoveCount) return;
		}
		if (teamDetails.spikes && teamDetails.spikes >= 2) {
			if (movePool.includes('spikes')) this.fastPop(movePool, movePool.indexOf('spikes'));
			if (moves.size + movePool.length <= this.maxMoveCount) return;
		}

		// Develop additional move lists
		const pivotingMoves = ['partingshot', 'uturn', 'voltswitch'];
		const badWithSetup = ['defog', 'dragontail', 'haze', 'healbell', 'nuzzle', 'pursuit', 'rapidspin', 'toxic'];
		const statusMoves = this.dex.moves.all()
			.filter(move => move.category === 'Status')
			.map(move => move.id);

		// These moves don't mesh well with other aspects of the set
		this.incompatibleMoves(moves, movePool, statusMoves, ['healingwish', 'memento', 'switcheroo', 'trick']);
		this.incompatibleMoves(moves, movePool, Setup, pivotingMoves);
		this.incompatibleMoves(moves, movePool, Setup, Hazards);
		this.incompatibleMoves(moves, movePool, Setup, badWithSetup);
		this.incompatibleMoves(moves, movePool, PhysicalSetup, PhysicalSetup);
		this.incompatibleMoves(moves, movePool, SpeedSetup, ['quickattack', 'suckerpunch']);
		this.incompatibleMoves(moves, movePool, 'defog', Hazards);
		this.incompatibleMoves(moves, movePool, ['fakeout', 'uturn'], ['switcheroo', 'trick']);
		this.incompatibleMoves(moves, movePool, 'substitute', pivotingMoves);
		this.incompatibleMoves(moves, movePool, 'leechseed', 'dragontail');
		this.incompatibleMoves(moves, movePool, 'rest', 'substitute');
		this.incompatibleMoves(moves, movePool, PhysicalSetup, 'dracometeor');
		this.incompatibleMoves(moves, movePool, SpecialSetup, 'knockoff');

		if (!types.includes('Normal')) {
			this.incompatibleMoves(moves, movePool, Setup, 'Explosion');
		}

		// These attacks are redundant with each other
		this.incompatibleMoves(moves, movePool, 'psychic', 'psyshock');
		this.incompatibleMoves(moves, movePool, 'scald', ['hydropump', 'originpulse', 'waterpulse']);
		this.incompatibleMoves(moves, movePool, 'return', ['bodyslam', 'doubleedge']);
		this.incompatibleMoves(moves, movePool, ['fierydance', 'firelash', 'lavaplume'], ['fireblast', 'magmastorm']);
		this.incompatibleMoves(moves, movePool, ['flamethrower', 'flareblitz'], ['fireblast', 'overheat']);
		this.incompatibleMoves(moves, movePool, 'hornleech', 'woodhammer');
		this.incompatibleMoves(moves, movePool, ['gigadrain', 'leafstorm'], ['leafstorm', 'petaldance', 'powerwhip']);
		this.incompatibleMoves(moves, movePool, 'wildcharge', 'thunderbolt');
		this.incompatibleMoves(moves, movePool, 'gunkshot', 'poisonjab');
		this.incompatibleMoves(moves, movePool, ['drainpunch', 'focusblast'], ['closecombat', 'highjumpkick', 'superpower']);
		this.incompatibleMoves(moves, movePool, 'stoneedge', 'headsmash');
		this.incompatibleMoves(moves, movePool, 'dracometeor', 'dragonpulse');
		this.incompatibleMoves(moves, movePool, 'dragonclaw', 'outrage');
		this.incompatibleMoves(moves, movePool, 'knockoff', ['darkestlariat', 'darkpulse', 'foulplay']);
		if (!types.includes('Dark') && preferredType !== 'Dark') {
			this.incompatibleMoves(moves, movePool, 'knockoff', ['pursuit', 'suckerpunch']);
		}

		// Status move incompatibilities
		const statusInflictingMoves = ['thunderwave', 'toxic', 'willowisp', 'yawn'];
		if (!abilities.has('Prankster')) {
			this.incompatibleMoves(moves, movePool, statusInflictingMoves, statusInflictingMoves);
		}
		this.incompatibleMoves(moves, movePool, 'toxic', 'toxicspikes');
		this.incompatibleMoves(moves, movePool, 'taunt', 'disable');
		this.incompatibleMoves(moves, movePool, 'defog', ['leechseed', 'substitute']);

		// Assorted hardcodes go here:
		// Lunatone
		this.incompatibleMoves(moves, movePool, 'moonlight', 'rockpolish');
		// Smeargle
		this.incompatibleMoves(moves, movePool, 'destinybond', 'whirlwind');
		// Z-Conversion Porygon-Z
		if (species.id === 'porygonz') {
			this.incompatibleMoves(moves, movePool, 'shadowball', 'recover');
		}
		// Liepard
		this.incompatibleMoves(moves, movePool, 'copycat', 'uturn');
		// Seviper
		this.incompatibleMoves(moves, movePool, 'switcheroo', 'suckerpunch');
	}

	// Checks for and removes incompatible moves, starting with the first move in movesA.
	incompatibleMoves(
		moves: Set<string>,
		movePool: string[],
		movesA: string | string[],
		movesB: string | string[],
	): void {
		const moveArrayA = (Array.isArray(movesA)) ? movesA : [movesA];
		const moveArrayB = (Array.isArray(movesB)) ? movesB : [movesB];
		if (moves.size + movePool.length <= this.maxMoveCount) return;
		for (const moveid1 of moves) {
			if (moveArrayB.includes(moveid1)) {
				for (const moveid2 of moveArrayA) {
					if (moveid1 !== moveid2 && movePool.includes(moveid2)) {
						this.fastPop(movePool, movePool.indexOf(moveid2));
						if (moves.size + movePool.length <= this.maxMoveCount) return;
					}
				}
			}
			if (moveArrayA.includes(moveid1)) {
				for (const moveid2 of moveArrayB) {
					if (moveid1 !== moveid2 && movePool.includes(moveid2)) {
						this.fastPop(movePool, movePool.indexOf(moveid2));
						if (moves.size + movePool.length <= this.maxMoveCount) return;
					}
				}
			}
		}
	}

	// Adds a move to the moveset, returns the MoveCounter
	addMove(
		move: string,
		moves: Set<string>,
		types: string[],
		abilities: Set<string>,
		teamDetails: RandomTeamsTypes.TeamDetails,
		species: Species,
		isLead: boolean,
		isDoubles: boolean,
		movePool: string[],
		preferredType: string,
		role: string,
	): MoveCounter {
		moves.add(move);
		this.fastPop(movePool, movePool.indexOf(move));
		const counter = this.newQueryMoves(moves, species, preferredType, abilities);
		this.cullMovePool(types, moves, abilities, counter, movePool, teamDetails, species, isLead, isDoubles,
			preferredType, role);
		return counter;
	}

	// Returns the type of a given move for STAB/coverage enforcement purposes
	getMoveType(move: Move, species: Species, abilities: Set<string>, preferredType: string): string {
		if (['judgment', 'multiattack', 'revelationdance'].includes(move.id)) return species.types[0];
		if (species.id === 'genesectdouse' && move.id === 'technoblast') return 'Water';

		const moveType = move.type;
		if (moveType === 'Normal') {
			if (abilities.has('Aerilate')) return 'Flying';
			if (abilities.has('Galvanize')) return 'Electric';
			if (abilities.has('Pixilate')) return 'Fairy';
			if (abilities.has('Refrigerate')) return 'Ice';
		}
		return moveType;
	}

	// Generate random moveset for a given species, role, preferred type.
	randomMoveset(
		types: string[],
		abilities: Set<string>,
		teamDetails: RandomTeamsTypes.TeamDetails,
		species: Species,
		isLead: boolean,
		isDoubles: boolean,
		movePool: string[],
		preferredType: string,
		role: string,
	): Set<string> {
		const moves = new Set<string>();
		let counter = this.newQueryMoves(moves, species, preferredType, abilities);
		this.cullMovePool(types, moves, abilities, counter, movePool, teamDetails, species, isLead, isDoubles,
			preferredType, role);

		// If there are only four moves, add all moves and return early
		if (movePool.length <= this.maxMoveCount) {
			// Still need to ensure that multiple Hidden Powers are not added (if maxMoveCount is increased)
			while (movePool.length) {
				const moveid = this.sample(movePool);
				counter = this.addMove(moveid, moves, types, abilities, teamDetails, species, isLead, isDoubles,
					movePool, preferredType, role);
			}
			return moves;
		}

		const runEnforcementChecker = (checkerName: string) => {
			if (!this.moveEnforcementCheckers[checkerName]) return false;
			return this.moveEnforcementCheckers[checkerName](
				movePool, moves, abilities, new Set(types), counter, species, teamDetails
			);
		};

		// Add required move (e.g. Relic Song for Meloetta-P)
		if (species.requiredMove) {
			const move = this.dex.moves.get(species.requiredMove).id;
			counter = this.addMove(move, moves, types, abilities, teamDetails, species, isLead, isDoubles,
				movePool, preferredType, role);
		}

		// Add other moves you really want to have, e.g. STAB, recovery, setup.

		// Enforce Facade if Guts is a possible ability
		if (movePool.includes('facade') && abilities.has('Guts')) {
			counter = this.addMove('facade', moves, types, abilities, teamDetails, species, isLead, isDoubles,
				movePool, preferredType, role);
		}

		// Enforce Seismic Toss, Spore, and Sticky Web
		for (const moveid of ['seismictoss', 'spore', 'stickyweb']) {
			if (movePool.includes(moveid)) {
				counter = this.addMove(moveid, moves, types, abilities, teamDetails, species, isLead, isDoubles,
					movePool, preferredType, role);
			}
		}

		// Enforce Thunder Wave on Prankster users
		if (movePool.includes('thunderwave') && abilities.has('Prankster')) {
			counter = this.addMove('thunderwave', moves, types, abilities, teamDetails, species, isLead, isDoubles,
				movePool, preferredType, role);
		}

		// Enforce Shadow Sneak on Kecleon
		if (movePool.includes('shadowsneak') && species.id === 'kecleon') {
			counter = this.addMove('shadowsneak', moves, types, abilities, teamDetails, species, isLead, isDoubles,
				movePool, preferredType, role);
		}

		// Enforce hazard removal on Bulky Support if the team doesn't already have it
		if (role === 'Bulky Support' && !teamDetails.defog && !teamDetails.rapidSpin) {
			if (movePool.includes('rapidspin')) {
				counter = this.addMove('rapidspin', moves, types, abilities, teamDetails, species, isLead, isDoubles,
					movePool, preferredType, role);
			}
			if (movePool.includes('defog')) {
				counter = this.addMove('defog', moves, types, abilities, teamDetails, species, isLead, isDoubles,
					movePool, preferredType, role);
			}
		}

		// Enforce STAB priority
		if (['Bulky Attacker', 'Bulky Setup'].includes(role) || priorityPokemon.includes(species.id)) {
			const priorityMoves = [];
			for (const moveid of movePool) {
				const move = this.dex.moves.get(moveid);
				const moveType = this.getMoveType(move, species, abilities, preferredType);
				if (types.includes(moveType) && move.priority > 0 && (move.basePower || move.basePowerCallback)) {
					priorityMoves.push(moveid);
				}
			}
			if (priorityMoves.length) {
				const moveid = this.sample(priorityMoves);
				counter = this.addMove(moveid, moves, types, abilities, teamDetails, species, isLead, isDoubles,
					movePool, preferredType, role);
			}
		}

		// Enforce STAB
		for (const type of types) {
			// Check if a STAB move of that type should be required
			const stabMoves = [];
			for (const moveid of movePool) {
				const move = this.dex.moves.get(moveid);
				const moveType = this.getMoveType(move, species, abilities, preferredType);
				if (!this.noStab.includes(moveid) && (move.basePower || move.basePowerCallback) && type === moveType) {
					stabMoves.push(moveid);
				}
			}
			while (runEnforcementChecker(type)) {
				if (!stabMoves.length) break;
				const moveid = this.sampleNoReplace(stabMoves);
				counter = this.addMove(moveid, moves, types, abilities, teamDetails, species, isLead, isDoubles,
					movePool, preferredType, role);
			}
		}

		// Enforce Preferred Type
		if (!counter.get('preferred')) {
			const stabMoves = [];
			for (const moveid of movePool) {
				const move = this.dex.moves.get(moveid);
				const moveType = this.getMoveType(move, species, abilities, preferredType);
				if (!this.noStab.includes(moveid) && (move.basePower || move.basePowerCallback) && preferredType === moveType) {
					stabMoves.push(moveid);
				}
			}
			if (stabMoves.length) {
				const moveid = this.sample(stabMoves);
				counter = this.addMove(moveid, moves, types, abilities, teamDetails, species, isLead, isDoubles,
					movePool, preferredType, role);
			}
		}

		// If no STAB move was added, add a STAB move
		if (!counter.get('stab')) {
			const stabMoves = [];
			for (const moveid of movePool) {
				const move = this.dex.moves.get(moveid);
				const moveType = this.getMoveType(move, species, abilities, preferredType);
				if (!this.noStab.includes(moveid) && (move.basePower || move.basePowerCallback) && types.includes(moveType)) {
					stabMoves.push(moveid);
				}
			}
			if (stabMoves.length) {
				const moveid = this.sample(stabMoves);
				counter = this.addMove(moveid, moves, types, abilities, teamDetails, species, isLead, isDoubles,
					movePool, preferredType, role);
			} else {
				// If they have no regular STAB move, enforce U-turn on Bug types.
				if (movePool.includes('uturn') && types.includes('Bug')) {
					counter = this.addMove('uturn', moves, types, abilities, teamDetails, species, isLead, isDoubles,
						movePool, preferredType, role);
				}
			}
		}

		// Enforce recovery
		if (['Bulky Support', 'Bulky Attacker', 'Bulky Setup', 'Staller'].includes(role)) {
			const recoveryMoves = movePool.filter(moveid => RecoveryMove.includes(moveid));
			if (recoveryMoves.length) {
				const moveid = this.sample(recoveryMoves);
				counter = this.addMove(moveid, moves, types, abilities, teamDetails, species, isLead, isDoubles,
					movePool, preferredType, role);
			}
		}

		// Enforce Staller moves
		if (role === 'Staller') {
			const enforcedMoves = [...ProtectMove, 'toxic', 'wish'];
			for (const move of enforcedMoves) {
				if (movePool.includes(move)) {
					counter = this.addMove(move, moves, types, abilities, teamDetails, species, isLead, isDoubles,
						movePool, preferredType, role);
				}
			}
		}

		// Enforce setup
		if (role.includes('Setup') || role === 'Z-Move user') {
			// Prioritise other setup moves over Flame Charge
			const setupMoves = movePool.filter(moveid => Setup.includes(moveid) && moveid !== 'flamecharge');
			if (setupMoves.length) {
				const moveid = this.sample(setupMoves);
				counter = this.addMove(moveid, moves, types, abilities, teamDetails, species, isLead, isDoubles,
					movePool, preferredType, role);
			} else {
				if (movePool.includes('flamecharge')) {
					counter = this.addMove('flamecharge', moves, types, abilities, teamDetails, species, isLead, isDoubles,
						movePool, preferredType, role);
				}
			}
		}

		// Enforce a move not on the noSTAB list
		if (!counter.damagingMoves.size && !(moves.has('uturn') && types.includes('Bug'))) {
			// Choose an attacking move
			const attackingMoves = [];
			for (const moveid of movePool) {
				const move = this.dex.moves.get(moveid);
				if (!this.noStab.includes(moveid) && (move.category !== 'Status')) attackingMoves.push(moveid);
			}
			if (attackingMoves.length) {
				const moveid = this.sample(attackingMoves);
				counter = this.addMove(moveid, moves, types, abilities, teamDetails, species, isLead, isDoubles,
					movePool, preferredType, role);
			}
		}

		// Enforce coverage move
		if (['Fast Attacker', 'Setup Sweeper', 'Bulky Attacker', 'Wallbreaker', 'Z-Move user'].includes(role)) {
			if (counter.damagingMoves.size === 1) {
				// Find the type of the current attacking move
				const currentAttackType = counter.damagingMoves.values().next().value.type;
				// Choose an attacking move that is of different type to the current single attack
				const coverageMoves = [];
				for (const moveid of movePool) {
					const move = this.dex.moves.get(moveid);
					const moveType = this.getMoveType(move, species, abilities, preferredType);
					if (!this.noStab.includes(moveid) && (move.basePower || move.basePowerCallback)) {
						if (currentAttackType !== moveType) coverageMoves.push(moveid);
					}
				}
				if (coverageMoves.length) {
					const moveid = this.sample(coverageMoves);
					counter = this.addMove(moveid, moves, types, abilities, teamDetails, species, isLead, isDoubles,
						movePool, preferredType, role);
				}
			}
		}

		// Choose remaining moves randomly from movepool and add them to moves list:
		while (moves.size < this.maxMoveCount && movePool.length) {
			const moveid = this.sample(movePool);
			counter = this.addMove(moveid, moves, types, abilities, teamDetails, species, isLead, isDoubles,
				movePool, preferredType, role);
			for (const pair of MovePairs) {
				if (moveid === pair[0] && movePool.includes(pair[1])) {
					counter = this.addMove(pair[1], moves, types, abilities, teamDetails, species, isLead, isDoubles,
						movePool, preferredType, role);
				}
				if (moveid === pair[1] && movePool.includes(pair[0])) {
					counter = this.addMove(pair[0], moves, types, abilities, teamDetails, species, isLead, isDoubles,
						movePool, preferredType, role);
				}
			}
		}
		return moves;
	}

	shouldCullAbility(
		ability: string,
		types: Set<string>,
		moves: Set<string>,
		abilities: Set<string>,
		counter: MoveCounter,
		movePool: string[],
		teamDetails: RandomTeamsTypes.TeamDetails,
		species: Species,
		isDoubles: boolean,
		preferredType = '',
		role = ''
	): boolean {
		switch (ability) {
		case 'Battle Bond': case 'Dazzling': case 'Flare Boost': case 'Gluttony': case 'Harvest': case 'Hyper Cutter':
		case 'Ice Body': case 'Innards Out': case 'Liquid Voice': case 'Magician': case 'Moody': case 'Sand Veil':
		case 'Snow Cloak': case 'Steadfast': case 'Weak Armor':
			return true;
		case 'Aerilate': case 'Galvanize': case 'Pixilate': case 'Refrigerate':
			return ['doubleedge', 'hypervoice', 'return'].every(m => !moves.has(m));
		case 'Chlorophyll':
			// Petal Dance is for Lilligant
			return (
				species.baseStats.spe > 100 || moves.has('petaldance') ||
				(!moves.has('sunnyday') && !teamDetails.sun)
			);
		case 'Competitive':
			return !counter.get('Special');
		case 'Compound Eyes': case 'No Guard':
			// Shadow Punch bit is for Golurk
			return (!counter.get('inaccurate') || moves.has('shadowpunch'));
		case 'Contrary': case 'Skill Link': case 'Strong Jaw':
			return !counter.get(toID(ability));
		case 'Defiant': case 'Justified': case 'Moxie':
			return !counter.get('Physical');
		case 'Hustle':
			return counter.get('Physical') < 2;
		case 'Hydration': case 'Rain Dish': case 'Swift Swim':
			return (
				species.baseStats.spe > 100 || !moves.has('raindance') && !teamDetails.rain ||
				!moves.has('raindance') && ['Rock Head', 'Water Absorb'].some(abil => abilities.has(abil))
			);
		case 'Intimidate':
			// Slam part is for Tauros
			return (moves.has('bodyslam') || species.id === 'staraptor');
		case 'Iron Fist':
			// Dynamic Punch bit is for Golurk
			return (!counter.get(toID(ability)) || moves.has('dynamicpunch'));
		case 'Lightning Rod':
			return (
				types.has('Ground') || species.id === 'marowakalola' ||
				((!!teamDetails.rain || moves.has('raindance')) && species.id === 'seaking')
			);
		case 'Magic Guard': case 'Speed Boost':
			return (abilities.has('Tinted Lens') && role === 'Wallbreaker');
		case 'Mold Breaker':
			return (
				species.baseSpecies === 'Basculin' || species.id === 'pangoro' || abilities.has('Sheer Force')
			);
		case 'Oblivious': case 'Prankster':
			return !counter.get('Status');
		case 'Overgrow':
			return !counter.get('Grass');
		case 'Power Construct':
			return species.forme === '10%';
		case 'Pressure': case 'Synchronize':
			return (counter.get('Status') < 2 || !!counter.get('recoil') || !!species.isMega);
		case 'Regenerator':
			return species.id === 'mienshao' || species.id === 'reuniclus';
		case 'Reckless': case 'Rock Head':
			return (!counter.get('recoil') || !!species.isMega);
		case 'Sand Force': case 'Sand Rush':
			return !teamDetails.sand;
		case 'Scrappy':
			return !types.has('Normal');
		case 'Serene Grace':
			return (!counter.get('serenegrace') || species.name === 'Blissey');
		case 'Sheer Force':
			return (
				!counter.get('sheerforce') ||
				moves.has('doubleedge') || abilities.has('Guts') ||
				!!species.isMega || species.id === 'toucannon'
			);
		case 'Simple':
			return !counter.get('setup');
		case 'Slush Rush':
			return !teamDetails.hail;
		case 'Snow Warning':
			// Aurorus
			return moves.has('hypervoice');
		case 'Solar Power':
			return (!counter.get('Special') || !teamDetails.sun || !!species.isMega);
		case 'Sturdy':
			return (!!counter.get('recoil') && !counter.get('recovery') || species.id === 'steelix');
		case 'Swarm':
			return (!counter.get('Bug') || !!species.isMega);
		case 'Technician':
			return (!counter.get('technician') || moves.has('tailslap') || !!species.isMega || species.id === 'persianalola');
		case 'Tinted Lens':
			return (['illumise', 'sigilyph', 'yanmega'].some(m => species.id === (m)) && role !== 'Wallbreaker');
		case 'Torrent':
			return (!counter.get('Water') || !!species.isMega);
		case 'Unaware':
			return (role !== 'Bulky Support' && role !== 'Staller');
		case 'Unburden':
			return (!!species.isMega || !counter.get('setup') && !moves.has('acrobatics'));
		case 'Water Absorb':
			return moves.has('raindance') || ['Drizzle', 'Unaware', 'Volt Absorb'].some(abil => abilities.has(abil));
		}

		return false;
	}


	getAbility(
		types: Set<string>,
		moves: Set<string>,
		abilities: Set<string>,
		counter: MoveCounter,
		movePool: string[],
		teamDetails: RandomTeamsTypes.TeamDetails,
		species: Species,
		isDoubles: boolean,
		preferredType = '',
		role = '',
	): string {
		if (species.battleOnly && !species.requiredAbility) {
			abilities = new Set(Object.values(this.dex.species.get(species.battleOnly as string).abilities));
		}
		const abilityData = Array.from(abilities).map(a => this.dex.abilities.get(a));
		Utils.sortBy(abilityData, abil => -abil.rating);

		if (abilityData.length <= 1) return abilityData[0].name;

		// Hard-code abilities here
		if (species.id === 'gurdurr' || (
			abilities.has('Guts') &&
			!abilities.has('Quick Feet') &&
			(moves.has('facade') || (moves.has('sleeptalk') && moves.has('rest')))
		)) return 'Guts';
		if (abilities.has('Moxie') && (counter.get('Physical') > 3 || moves.has('bounce')) && !isDoubles) return 'Moxie';
		if (species.name === 'Ambipom' && !counter.get('technician')) {
			// If it doesn't qualify for Technician, Skill Link is useless on it
			return 'Pickup';
		}
		if (
			abilities.has('Unburden') && ['acrobatics', 'bellydrum', 'closecombat'].some(m => moves.has(m))
		) return 'Unburden';
		if (species.id === 'starmie') return role === 'Wallbreaker' ? 'Analytic' : 'Natural Cure';
		if (abilities.has('Drought')) return 'Drought';
		if (species.id === 'talonflame' && role === 'Z-Move user') return 'Gale Wings';
		if (species.id === 'golemalola' && moves.has('return')) return 'Galvanize';
		if (abilities.has('Gluttony') && (moves.has('recycle') || moves.has('bellydrum'))) return 'Gluttony';
		if (abilities.has('Harvest') && (role === 'Bulky Support' || role === 'Staller')) return 'Harvest';
		if (species.name === 'Raticate-Alola') return 'Hustle';
		if (species.id === 'ninjask' || species.id === 'seviper') return 'Infiltrator';
		if (species.id === 'rampardos' && role === 'Bulky Attacker') return 'Mold Breaker';
		if (species.baseSpecies === 'Altaria') return 'Natural Cure';
		if (species.id === 'tsareena') return 'Queenly Majesty';
		if (role === 'AV Pivot' && abilities.has('Regenerator')) return 'Regenerator';
		if (species.id === 'druddigon' && role === 'Bulky Support') return 'Rough Skin';
		if (abilities.has('Scrappy') && moves.has('boomburst')) return 'Scrappy';
		if (abilities.has('Shed Skin') && moves.has('rest') && !moves.has('sleeptalk')) return 'Shed Skin';
		if (abilities.has('Sniper') && moves.has('focusenergy')) return 'Sniper';
		if (species.name === 'Kommo-o' && role === 'Z-Move user') return 'Soundproof';
		if (species.id === 'stunfisk') return 'Static';
		if (species.id === 'breloom') return 'Technician';
		if (abilities.has('Toxic Boost')) return 'Toxic Boost';
		if (species.id === 'porygon2') return 'Trace';
		if (types.has('Water') && counter.get('setup') && abilities.has('Weak Armor')) return 'Weak Armor';

		let abilityAllowed: Ability[] = [];
		// Obtain a list of abilities that are allowed (not culled)
		for (const ability of abilityData) {
			if (ability.rating >= 1 && !this.shouldCullAbility(
				ability.name, types, moves, abilities, counter, movePool, teamDetails, species, isDoubles, preferredType, role
			)) {
				abilityAllowed.push(ability);
			}
		}

		// If all abilities are rejected, re-allow all abilities
		if (!abilityAllowed.length) {
			for (const ability of abilityData) {
				if (ability.rating > 0) abilityAllowed.push(ability);
			}
			if (!abilityAllowed.length) abilityAllowed = abilityData;
		}

		if (abilityAllowed.length === 1) return abilityAllowed[0].name;
		// Sort abilities by rating with an element of randomness
		// All three abilities can be chosen
		if (abilityAllowed[2] && abilityAllowed[0].rating - 0.5 <= abilityAllowed[2].rating) {
			if (abilityAllowed[1].rating <= abilityAllowed[2].rating) {
				if (this.randomChance(1, 2)) [abilityAllowed[1], abilityAllowed[2]] = [abilityAllowed[2], abilityAllowed[1]];
			} else {
				if (this.randomChance(1, 3)) [abilityAllowed[1], abilityAllowed[2]] = [abilityAllowed[2], abilityAllowed[1]];
			}
			if (abilityAllowed[0].rating <= abilityAllowed[1].rating) {
				if (this.randomChance(2, 3)) [abilityAllowed[0], abilityAllowed[1]] = [abilityAllowed[1], abilityAllowed[0]];
			} else {
				if (this.randomChance(1, 2)) [abilityAllowed[0], abilityAllowed[1]] = [abilityAllowed[1], abilityAllowed[0]];
			}
		} else {
			// Third ability cannot be chosen
			if (abilityAllowed[0].rating <= abilityAllowed[1].rating) {
				if (this.randomChance(1, 2)) [abilityAllowed[0], abilityAllowed[1]] = [abilityAllowed[1], abilityAllowed[0]];
			} else if (abilityAllowed[0].rating - 0.5 <= abilityAllowed[1].rating) {
				if (this.randomChance(1, 3)) [abilityAllowed[0], abilityAllowed[1]] = [abilityAllowed[1], abilityAllowed[0]];
			}
		}

		// After sorting, choose the first ability
		return abilityAllowed[0].name;
	}

	getPriorityItem(
		ability: string,
		types: string[],
		moves: Set<string>,
		counter: MoveCounter,
		teamDetails: RandomTeamsTypes.TeamDetails,
		species: Species,
		isLead: boolean,
		preferredType = '',
		role = '',
	): string | undefined {
		// Z-Moves
		if (role === 'Z-Move user') {
			// Specific Z-Crystals
			if (species.baseSpecies === 'Arceus' && species.requiredItems) return species.requiredItems[1];
			if (species.name === 'Raichu-Alola') return 'Aloraichium Z';
			if (species.name === 'Decidueye') return 'Decidium Z';
			if (species.name === 'Kommo-o') return 'Kommonium Z';
			if (species.name === 'Lunala') return 'Lunalium Z';
			if (species.baseSpecies === 'Lycanroc') return 'Lycanium Z';
			if (species.name === 'Marshadow') return 'Marshadium Z';
			if (species.name === 'Mew') return 'Mewnium Z';
			if (species.name === 'Mimikyu') return 'Mimikium Z';
			if (species.name === 'Necrozma-Dusk-Mane' || species.name === 'Necrozma-Dawn-Wings') {
				if (moves.has('autotomize') && moves.has('sunsteelstrike')) return 'Solganium Z';
				if (moves.has('autotomize') && moves.has('moongeistbeam')) return 'Lunalium Z';
				return 'Ultranecrozium Z';
			}
			// General Z-Crystals
			if (preferredType === 'Normal') return 'Normalium Z';
			if (preferredType) return this.dex.species.get(`Arceus-${preferredType}`).requiredItems![1];
		}
		if (species.requiredItems) {
			if (species.baseSpecies === 'Arceus') return species.requiredItems[0];
			return this.sample(species.requiredItems);
		}
		if (role === 'AV Pivot') return 'Assault Vest';
		// maybe cut this one
		if (species.name === 'Deoxys-Attack') return 'Life Orb';
		if (species.name === 'Farfetch\u2019d') return 'Stick';
		if (species.baseSpecies === 'Marowak') return 'Thick Club';
		if (species.name === 'Pikachu') return 'Light Ball';
		if (species.name === 'Shedinja' || species.name === 'Smeargle') return 'Focus Sash';
		if (species.name === 'Unfezant' || moves.has('focusenergy')) return 'Scope Lens';
		if (species.name === 'Unown') return 'Choice Specs';
		if (species.name === 'Wobbuffet') return 'Custap Berry';
		if (species.name === 'Shuckle') return 'Mental Herb';
		if (
			ability === 'Harvest' || ability === 'Cheek Pouch' || (ability === 'Emergency Exit' && !!counter.get('Status'))
		) return 'Sitrus Berry';
		if (species.name === 'Ditto') return 'Choice Scarf';
		if (ability === 'Poison Heal') return 'Toxic Orb';
		if (ability === 'Speed Boost') return 'Life Orb';
		if (species.nfe) return (species.name === 'Scyther' && role === 'Fast Attacker') ? 'Choice Band' : 'Eviolite';
		if (['healingwish', 'memento', 'switcheroo', 'trick'].some(m => moves.has(m))) {
			if (species.baseStats.spe >= 60 && species.baseStats.spe <= 108 && role !== 'Wallbreaker') {
				return 'Choice Scarf';
			} else {
				return (counter.get('Physical') > counter.get('Special')) ? 'Choice Band' : 'Choice Specs';
			}
		}
		if (moves.has('bellydrum') || moves.has('recycle')) {
			if (ability === 'Gluttony') {
				return `${this.sample(['Aguav', 'Figy', 'Iapapa', 'Mago', 'Wiki'])} Berry`;
			} else {
				return 'Sitrus Berry';
			}
		}
		if (moves.has('geomancy') || moves.has('skyattack')) return 'Power Herb';
		if (moves.has('shellsmash')) {
			return (ability === 'Solid Rock' && !!counter.get('priority')) ? 'Weakness Policy' : 'White Herb';
		}
		if ((ability === 'Guts' || moves.has('facade')) && !moves.has('sleeptalk')) {
			return (types.includes('Fire') || ability === 'Quick Feet' || ability === 'Toxic Boost') ? 'Toxic Orb' : 'Flame Orb';
		}
		if (ability === 'Magic Guard' && role !== 'Bulky Support') {
			return moves.has('counter') ? 'Focus Sash' : 'Life Orb';
		}
		if (ability === 'Sheer Force' && counter.get('sheerforce')) return 'Life Orb';
		if (ability === 'Unburden') return moves.has('closecombat') ? 'White Herb' : 'Sitrus Berry';
		if (moves.has('acrobatics')) return '';
		if (moves.has('auroraveil') || moves.has('lightscreen') && moves.has('reflect')) return 'Light Clay';
		if (moves.has('rest') && !moves.has('sleeptalk') && !['Hydration', 'Natural Cure', 'Shed Skin'].includes(ability)) {
			return 'Chesto Berry';
		}
		if (role === 'Staller') return 'Leftovers';
	}

	getItem(
		ability: string,
		types: string[],
		moves: Set<string>,
		counter: MoveCounter,
		teamDetails: RandomTeamsTypes.TeamDetails,
		species: Species,
		isLead: boolean,
		preferredType: string,
		role: string,
	): string {
		const defensiveStatTotal = species.baseStats.hp + species.baseStats.def + species.baseStats.spd;

		const scarfReqs = (
			role !== 'Wallbreaker' &&
			species.baseStats.spe >= 60 && species.baseStats.spe <= 108 &&
			!counter.get('priority') && !moves.has('pursuit')
		);

		if (
			moves.has('pursuit') && moves.has('suckerpunch') && counter.get('Dark') && !priorityPokemon.includes(species.id)
		) return 'Black Glasses';
		if (counter.get('Special') === 4) {
			return (
				scarfReqs && species.baseStats.spa >= 90 && this.randomChance(1, 2)
			) ? 'Choice Scarf' : 'Choice Specs';
		}
		if (counter.get('Special') === 3 && moves.has('uturn')) return 'Choice Specs';
		if (counter.get('Physical') === 4 && species.id !== 'jirachi' &&
			['dragontail', 'fakeout', 'flamecharge', 'nuzzle', 'rapidspin'].every(m => !moves.has(m))
		) {
			return (
				scarfReqs && (species.baseStats.atk >= 100 || ability === 'Pure Power' || ability === 'Huge Power') &&
				this.randomChance(1, 2)
			) ? 'Choice Scarf' : 'Choice Band';
		}

		if (ability === 'Sturdy' && moves.has('explosion') && !counter.get('speedsetup')) return 'Custap Berry';
		if (types.includes('Normal') && moves.has('fakeout') && !!counter.get('Normal')) return 'Silk Scarf';
		if (role === 'Bulky Setup' && !!counter.get('speedsetup') && !moves.has('swordsdance')) {
			return 'Weakness Policy';
		}
		if (species.id === 'palkia') return 'Lustrous Orb';
		if (species.id === 'archeops') return 'Expert Belt';
		if (!counter.get('Status') && (
			['Fast Support', 'Bulky Support', 'Bulky Attacker'].some(m => role === m) || moves.has('rapidspin')
		)) {
			return 'Assault Vest';
		}
		if (moves.has('outrage') && counter.get('setup')) return 'Lum Berry';
		if (
			(ability === 'Rough Skin') || (species.id !== 'hooh' &&
			ability === 'Regenerator' && species.baseStats.hp + species.baseStats.def >= 180 && this.randomChance(1, 2))
		) return 'Rocky Helmet';
		if (['protect', 'spikyshield', 'substitute'].some(m => moves.has(m))) return 'Leftovers';
		if (
			this.dex.getEffectiveness('Ground', species) >= 2 &&
			ability !== 'Levitate'
		) {
			return 'Air Balloon';
		}
		if (
			(role === 'Fast Support' || moves.has('stickyweb')) && isLead && defensiveStatTotal < 255 &&
			!counter.get('recovery') && !moves.has('protect') && (!counter.get('recoil') || ability === 'Rock Head')
		) return 'Focus Sash';

		// Default Items
		if (role === 'Fast Support') {
			return (
				counter.get('Physical') + counter.get('Special') >= 3 &&
				['nuzzle', 'rapidspin', 'uturn', 'voltswitch'].every(m => !moves.has(m)) &&
				this.dex.getEffectiveness('Rock', species) < 2
			) ? 'Life Orb' : 'Leftovers';
		}
		if (!counter.get('Status')) {
			return (
				(moves.has('uturn') || moves.has('voltswitch')) && !counter.get('Dragon') && !counter.get('Normal')
			) ? 'Expert Belt' : 'Life Orb';
		}
		if (
			['Fast Attacker', 'Setup Sweeper', 'Wallbreaker'].some(m => role === m) &&
			(this.dex.getEffectiveness('Rock', species) < 2 || species.id === 'ninjask') &&
			ability !== 'Sturdy'
		) return 'Life Orb';
		return 'Leftovers';
	}

	randomSet(
		species: string | Species,
		teamDetails: RandomTeamsTypes.TeamDetails = {},
		isLead = false,
		isDoubles = false
	): RandomTeamsTypes.RandomSet {
		if (isDoubles) return this.randomDoublesSet(species, teamDetails, isLead);
		species = this.dex.species.get(species);
		let forme = species.name;

		if (typeof species.battleOnly === 'string') {
			// Only change the forme. The species has custom moves, and may have different typing and requirements.
			forme = species.battleOnly;
		}
		if (species.cosmeticFormes) {
			forme = this.sample([species.name].concat(species.cosmeticFormes));
		}
		const sets = this.randomSets[species.id]["sets"];
		const possibleSets = [];
		// Check if the Pokemon has a Z-Move user set
		let canZMove = false;
		for (const set of sets) {
			if (!teamDetails.zMove && set.role === 'Z-Move user') canZMove = true;
		}
		for (const set of sets) {
			// Prevent multiple Z-Move users
			if (teamDetails.zMove && set.role === 'Z-Move user') continue;
			// Prevent Setup Sweeper and Bulky Setup if Z-Move user is available
			if (canZMove && ['Setup Sweeper', 'Bulky Setup'].includes(set.role)) continue;
			possibleSets.push(set);
		}
		const set = this.sampleIfArray(possibleSets);
		const role = set.role;
		const movePool: string[] = Array.from(set.movepool);
		const preferredTypes = set.preferredTypes;
		const preferredType = this.sampleIfArray(preferredTypes);

		let ability = '';
		let item = undefined;

		const evs = {hp: 85, atk: 85, def: 85, spa: 85, spd: 85, spe: 85};
		const ivs = {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31};

		const types = species.types;
		const abilities = new Set(Object.values(species.abilities));
		if (species.unreleasedHidden) abilities.delete(species.abilities.H);

		// Get moves
		const moves = this.randomMoveset(types, abilities, teamDetails, species, isLead, isDoubles, movePool,
			preferredType, role);
		const counter = this.newQueryMoves(moves, species, preferredType, abilities);

		// Get ability
		ability = this.getAbility(new Set(types), moves, abilities, counter, movePool, teamDetails, species,
			false, preferredType, role);

		// Get items
		item = this.getPriorityItem(ability, types, moves, counter, teamDetails, species, isLead, preferredType, role);
		if (item === undefined) {
			item = this.getItem(ability, types, moves, counter, teamDetails, species, isLead, preferredType, role);
		}

		// For Trick / Switcheroo
		if (item === 'Leftovers' && types.includes('Poison')) {
			item = 'Black Sludge';
		}

		const level = this.adjustLevel || this.randomSets[species.id]["level"] || (species.nfe ? 90 : 80);

		// Minimize confusion damage
		if (!counter.get('Physical') && !moves.has('copycat') && !moves.has('transform')) {
			evs.atk = 0;
			ivs.atk = 0;
		}

		// Ensure Nihilego's Beast Boost gives it Special Attack boosts instead of Special Defense
		if (forme === 'Nihilego') evs.spd -= 32;

		if (ability === 'Beast Boost' && counter.get('Special') < 1) {
			evs.spa = 0;
			ivs.spa = 0;
		}

		// We use a special variable to track Hidden Power
		// so that we can check for all Hidden Powers at once
		let hasHiddenPower = false;
		for (const move of moves) {
			if (move.startsWith('hiddenpower')) hasHiddenPower = true;
		}

		// Fix IVs for non-Bottle Cap-able sets
		if (hasHiddenPower && level < 100) {
			let hpType;
			for (const move of moves) {
				if (move.startsWith('hiddenpower')) hpType = move.substr(11);
			}
			if (!hpType) throw new Error(`hasHiddenPower is true, but no Hidden Power move was found.`);
			const HPivs = ivs.atk === 0 ? ZeroAttackHPIVs[hpType] : this.dex.types.get(hpType).HPivs;
			let iv: StatID;
			for (iv in HPivs) {
				ivs[iv] = HPivs[iv]!;
			}
		}

		// Prepare optimal HP
		const srImmunity = ability === 'Magic Guard';
		const srWeakness = srImmunity ? 0 : this.dex.getEffectiveness('Rock', species);
		while (evs.hp > 1) {
			const hp = Math.floor(Math.floor(2 * species.baseStats.hp + ivs.hp + Math.floor(evs.hp / 4) + 100) * level / 100 + 10);
			if (moves.has('substitute') && (item === 'Sitrus Berry' || (ability === 'Power Construct' && item !== 'Leftovers'))) {
				// Two Substitutes should activate Sitrus Berry or Power Construct
				if (hp % 4 === 0) break;
			} else if (moves.has('bellydrum') && (item === 'Sitrus Berry' || ability === 'Gluttony')) {
				// Belly Drum should activate Sitrus Berry
				if (hp % 2 === 0) break;
			} else {
				// Maximize number of Stealth Rock switch-ins
				if (srWeakness <= 0 || ability === 'Regenerator' || ['Leftovers', 'Life Orb'].includes(item)) break;
				if (item !== 'Sitrus Berry' && hp % (4 / srWeakness) > 0) break;
				// Minimise number of Stealth Rock switch-ins to activate Sitrus Berry
				if (item === 'Sitrus Berry' && hp % (4 / srWeakness) === 0) break;
			}
			evs.hp -= 4;
		}

		if (['gyroball', 'metalburst', 'trickroom'].some(m => moves.has(m))) {
			evs.spe = 0;
			ivs.spe = (hasHiddenPower && level < 100) ? ivs.spe - 30 : 0;
		}

		// shuffle moves to add more randomness to camomons
		const shuffledMoves = Array.from(moves);
		this.prng.shuffle(shuffledMoves);

		// Z-Conversion Porygon-Z should have Shadow Ball first if no Recover, otherwise Thunderbolt
		if (species.id === 'porygonz' && role === 'Z-Move user') {
			const firstMove = (moves.has('shadowball') ? 'shadowball' : 'thunderbolt');
			this.fastPop(shuffledMoves, shuffledMoves.indexOf(firstMove));
			shuffledMoves.unshift(firstMove);
		}
		return {
			name: species.baseSpecies,
			species: forme,
			gender: species.baseSpecies === 'Greninja' ? 'M' : species.gender,
			shiny: this.randomChance(1, 1024),
			level,
			moves: shuffledMoves,
			ability,
			evs,
			ivs,
			item,
			role,
		};
	}

	randomTeam() {
		this.enforceNoDirectCustomBanlistChanges();

		const seed = this.prng.seed;
		const ruleTable = this.dex.formats.getRuleTable(this.format);
		const pokemon = [];

		// For Monotype
		const isMonotype = !!this.forceMonotype || ruleTable.has('sametypeclause');
		const typePool = this.dex.types.names();
		const type = this.forceMonotype || this.sample(typePool);

		const baseFormes: {[k: string]: number} = {};
		let hasMega = false;

		const tierCount: {[k: string]: number} = {};
		const typeCount: {[k: string]: number} = {};
		const typeComboCount: {[k: string]: number} = {};
		const typeWeaknesses: {[k: string]: number} = {};
		const teamDetails: RandomTeamsTypes.TeamDetails = {};

		// We make at most two passes through the potential Pokemon pool when creating a team - if the first pass doesn't
		// result in a team of six Pokemon we perform a second iteration relaxing as many restrictions as possible.
		for (const restrict of [true, false]) {
			if (pokemon.length >= this.maxTeamSize) break;
			const pokemonPool = this.getPokemonPool(type, pokemon, isMonotype);
			while (pokemonPool.length && pokemon.length < this.maxTeamSize) {
				const species = this.dex.species.get(this.sampleNoReplace(pokemonPool));

				// Check if the forme has moves for random battle
				if (this.format.gameType === 'singles') {
					// Gen 7 is using the new set format, while Gen 6 is still using the old format
					if (this.gen === 7) {
						if (!this.randomSets[species.id]) continue;
						// If the team has a Z-Move user, reject Pokemon that only have the Z-Move user role
						if (
							this.randomSets[species.id]["sets"].length === 1 &&
							this.randomSets[species.id]["sets"][0]["role"] === 'Z-Move user' &&
							teamDetails.zMove
						) continue;
					} else {
						if (!this.randomData[species.id]?.moves) continue;
					}
				} else {
					if (!this.randomDoublesData[species.id]?.moves) continue;
				}
				if (!species.exists) continue;

				// Limit to one of each species (Species Clause)
				if (baseFormes[species.baseSpecies]) continue;

				// Limit one Mega per team
				if (hasMega && species.isMega) continue;

				// Adjust rate for species with multiple sets
				switch (species.baseSpecies) {
				case 'Arceus': case 'Silvally':
					if (this.randomChance(8, 9) && !isMonotype) continue;
					break;
				case 'Oricorio':
					if (this.randomChance(3, 4)) continue;
					break;
				case 'Castform': case 'Floette':
					if (this.randomChance(2, 3)) continue;
					break;
				case 'Aegislash': case 'Basculin': case 'Gourgeist': case 'Groudon': case 'Kyogre': case 'Meloetta':
					if (this.randomChance(1, 2)) continue;
					break;
				case 'Greninja':
					if (this.gen >= 7 && this.randomChance(1, 2)) continue;
					break;
				}
				if (species.otherFormes && !hasMega && (
					species.otherFormes.includes(species.name + '-Mega') ||
					species.otherFormes.includes(species.name + '-Mega-X')
				)) {
					continue;
				}

				const tier = species.tier;
				const types = species.types;
				const typeCombo = types.slice().sort().join();
				// Dynamically scale limits for different team sizes. The default and minimum value is 1.
				const limitFactor = Math.round(this.maxTeamSize / 6) || 1;

				if (restrict) {
					// Limit one Pokemon per tier, two for Monotype
					if (
						(tierCount[tier] >= (isMonotype || this.forceMonotype ? 2 : 1) * limitFactor) &&
						!this.randomChance(1, Math.pow(5, tierCount[tier]))
					) {
						continue;
					}

					if (!isMonotype && !this.forceMonotype) {
						// Limit two of any type
						let skip = false;
						for (const typeName of types) {
							if (typeCount[typeName] >= 2 * limitFactor) {
								skip = true;
								break;
							}
						}
						if (skip) continue;

						// Limit three weak to any type
						for (const typeName of this.dex.types.names()) {
							// it's weak to the type
							if (this.dex.getEffectiveness(typeName, species) > 0) {
								if (!typeWeaknesses[typeName]) typeWeaknesses[typeName] = 0;
								if (typeWeaknesses[typeName] >= 3 * limitFactor) {
									skip = true;
									break;
								}
							}
						}
						if (skip) continue;
					}

					// Limit one of any type combination, three in Monotype
					if (!this.forceMonotype && typeComboCount[typeCombo] >= (isMonotype ? 3 : 1) * limitFactor) continue;
				}

				const set = this.randomSet(
					species,
					teamDetails,
					pokemon.length === this.maxTeamSize - 1,
					this.format.gameType !== 'singles'
				);

				const item = this.dex.items.get(set.item);

				// Limit one Z-Move per team
				if (item.zMove && teamDetails.zMove) continue;

				// Zoroark copies the last Pokemon
				if (set.ability === 'Illusion') {
					if (pokemon.length < 1) continue;
					set.level = pokemon[pokemon.length - 1].level;
				}

				// Okay, the set passes, add it to our team
				pokemon.unshift(set);

				// Don't bother tracking details for the last Pokemon
				if (pokemon.length === this.maxTeamSize) break;

				// Now that our Pokemon has passed all checks, we can increment our counters
				baseFormes[species.baseSpecies] = 1;

				// Increment tier counter
				if (tierCount[tier]) {
					tierCount[tier]++;
				} else {
					tierCount[tier] = 1;
				}

				// Increment type counters
				for (const typeName of types) {
					if (typeName in typeCount) {
						typeCount[typeName]++;
					} else {
						typeCount[typeName] = 1;
					}
				}
				if (typeCombo in typeComboCount) {
					typeComboCount[typeCombo]++;
				} else {
					typeComboCount[typeCombo] = 1;
				}

				// Increment weakness counter
				for (const typeName of this.dex.types.names()) {
					// it's weak to the type
					if (this.dex.getEffectiveness(typeName, species) > 0) {
						typeWeaknesses[typeName]++;
					}
				}

				// Track what the team has
				if (item.megaStone || species.name === 'Rayquaza-Mega') hasMega = true;
				if (item.zMove) teamDetails.zMove = 1;
				if (set.ability === 'Snow Warning' || set.moves.includes('hail')) teamDetails.hail = 1;
				if (set.moves.includes('raindance') || set.ability === 'Drizzle' && !item.onPrimal) teamDetails.rain = 1;
				if (set.ability === 'Sand Stream') teamDetails.sand = 1;
				if (set.moves.includes('sunnyday') || set.ability === 'Drought' && !item.onPrimal) teamDetails.sun = 1;
				if (set.moves.includes('spikes')) teamDetails.spikes = (teamDetails.spikes || 0) + 1;
				if (set.moves.includes('stealthrock')) teamDetails.stealthRock = 1;
				if (set.moves.includes('stickyweb')) teamDetails.stickyWeb = 1;
				if (set.moves.includes('toxicspikes')) teamDetails.toxicSpikes = 1;
				if (set.moves.includes('defog')) teamDetails.defog = 1;
				if (set.moves.includes('rapidspin')) teamDetails.rapidSpin = 1;
				if (set.moves.includes('auroraveil') || (set.moves.includes('reflect') && set.moves.includes('lightscreen'))) {
					teamDetails.screens = 1;
				}
			}
		}
		if (pokemon.length < this.maxTeamSize && pokemon.length < 12) {
			throw new Error(`Could not build a random team for ${this.format} (seed=${seed})`);
		}

		return pokemon;
	}

	randomFactorySets: {[format: string]: {[species: string]: BattleFactorySpecies}} = require('./factory-sets.json');

	randomFactorySet(
		species: Species, teamData: RandomTeamsTypes.FactoryTeamDetails, tier: string
	): RandomTeamsTypes.RandomFactorySet | null {
		const id = toID(species.name);
		const setList = this.randomFactorySets[tier][id].sets;

		const itemsMax: {[k: string]: number} = {
			choicespecs: 1,
			choiceband: 1,
			choicescarf: 1,
		};
		const movesMax: {[k: string]: number} = {
			rapidspin: 1,
			batonpass: 1,
			stealthrock: 1,
			defog: 1,
			spikes: 1,
			toxicspikes: 1,
		};
		const requiredMoves: {[k: string]: string} = {
			stealthrock: 'hazardSet',
			rapidspin: 'hazardClear',
			defog: 'hazardClear',
		};
		const weatherAbilitiesRequire: {[k: string]: string} = {
			hydration: 'raindance', swiftswim: 'raindance',
			leafguard: 'sunnyday', solarpower: 'sunnyday', chlorophyll: 'sunnyday',
			sandforce: 'sandstorm', sandrush: 'sandstorm', sandveil: 'sandstorm',
			slushrush: 'hail', snowcloak: 'hail',
		};
		const weatherAbilities = ['drizzle', 'drought', 'snowwarning', 'sandstream'];

		// Build a pool of eligible sets, given the team partners
		// Also keep track of sets with moves the team requires
		let effectivePool: {set: AnyObject, moveVariants?: number[]}[] = [];
		const priorityPool = [];
		for (const curSet of setList) {
			if (this.forceMonotype && !species.types.includes(this.forceMonotype)) continue;

			const item = this.dex.items.get(curSet.item);
			if (teamData.megaCount && teamData.megaCount > 0 && item.megaStone) continue; // reject 2+ mega stones
			if (teamData.zCount && teamData.zCount > 0 && item.zMove) continue; // reject 2+ Z stones
			if (itemsMax[item.id] && teamData.has[item.id] >= itemsMax[item.id]) continue;

			const ability = this.dex.abilities.get(curSet.ability);
			if (weatherAbilitiesRequire[ability.id] && teamData.weather !== weatherAbilitiesRequire[ability.id]) continue;
			if (teamData.weather && weatherAbilities.includes(ability.id)) continue; // reject 2+ weather setters

			let reject = false;
			let hasRequiredMove = false;
			const curSetVariants = [];
			for (const move of curSet.moves) {
				const variantIndex = this.random(move.length);
				const moveId = toID(move[variantIndex]);
				if (movesMax[moveId] && teamData.has[moveId] >= movesMax[moveId]) {
					reject = true;
					break;
				}
				if (requiredMoves[moveId] && !teamData.has[requiredMoves[moveId]]) {
					hasRequiredMove = true;
				}
				curSetVariants.push(variantIndex);
			}
			if (reject) continue;
			effectivePool.push({set: curSet, moveVariants: curSetVariants});
			if (hasRequiredMove) priorityPool.push({set: curSet, moveVariants: curSetVariants});
		}
		if (priorityPool.length) effectivePool = priorityPool;

		if (!effectivePool.length) {
			if (!teamData.forceResult) return null;
			for (const curSet of setList) {
				effectivePool.push({set: curSet});
			}
		}

		const setData = this.sample(effectivePool);
		const moves = [];
		for (const [i, moveSlot] of setData.set.moves.entries()) {
			moves.push(setData.moveVariants ? moveSlot[setData.moveVariants[i]] : this.sample(moveSlot));
		}


		const item = this.sampleIfArray(setData.set.item);
		const ability = this.sampleIfArray(setData.set.ability);
		const nature = this.sampleIfArray(setData.set.nature);
		const level = this.adjustLevel || setData.set.level || (tier === "LC" ? 5 : 100);

		return {
			name: setData.set.name || species.baseSpecies,
			species: setData.set.species,
			gender: setData.set.gender || species.gender || (this.randomChance(1, 2) ? 'M' : 'F'),
			item: item || '',
			ability: ability || species.abilities['0'],
			shiny: typeof setData.set.shiny === 'undefined' ? this.randomChance(1, 1024) : setData.set.shiny,
			level,
			happiness: typeof setData.set.happiness === 'undefined' ? 255 : setData.set.happiness,
			evs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...setData.set.evs},
			ivs: {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31, ...setData.set.ivs},
			nature: nature || 'Serious',
			moves,
		};
	}

	randomFactoryTeam(side: PlayerOptions, depth = 0): RandomTeamsTypes.RandomFactorySet[] {
		this.enforceNoDirectCustomBanlistChanges();

		const forceResult = (depth >= 12);
		const isMonotype = !!this.forceMonotype || this.dex.formats.getRuleTable(this.format).has('sametypeclause');

		// The teams generated depend on the tier choice in such a way that
		// no exploitable information is leaked from rolling the tier in getTeam(p1).
		if (!this.factoryTier) {
			this.factoryTier = isMonotype ? 'Mono' : this.sample(['Uber', 'OU', 'UU', 'RU', 'NU', 'PU', 'LC']);
		} else if (isMonotype && this.factoryTier !== 'Mono') {
			// I don't think this can ever happen?
			throw new Error(`Can't generate a Monotype Battle Factory set in a battle with factory tier ${this.factoryTier}`);
		}

		const tierValues: {[k: string]: number} = {
			Uber: 5,
			OU: 4, UUBL: 4,
			UU: 3, RUBL: 3,
			RU: 2, NUBL: 2,
			NU: 1, PUBL: 1,
			PU: 0,
		};

		const pokemon = [];
		const pokemonPool = Object.keys(this.randomFactorySets[this.factoryTier]);

		const typePool = this.dex.types.names();
		const type = this.sample(typePool);

		const teamData: TeamData = {
			typeCount: {}, typeComboCount: {}, baseFormes: {}, megaCount: 0, zCount: 0,
			has: {}, forceResult: forceResult, weaknesses: {}, resistances: {},
		};
		const requiredMoveFamilies = ['hazardSet', 'hazardClear'];
		const requiredMoves: {[k: string]: string} = {
			stealthrock: 'hazardSet',
			rapidspin: 'hazardClear',
			defog: 'hazardClear',
		};
		const weatherAbilitiesSet: {[k: string]: string} = {
			drizzle: 'raindance',
			drought: 'sunnyday',
			snowwarning: 'hail',
			sandstream: 'sandstorm',
		};
		const resistanceAbilities: {[k: string]: string[]} = {
			dryskin: ['Water'], waterabsorb: ['Water'], stormdrain: ['Water'],
			flashfire: ['Fire'], heatproof: ['Fire'],
			lightningrod: ['Electric'], motordrive: ['Electric'], voltabsorb: ['Electric'],
			sapsipper: ['Grass'],
			thickfat: ['Ice', 'Fire'],
			levitate: ['Ground'],
		};

		while (pokemonPool.length && pokemon.length < this.maxTeamSize) {
			const species = this.dex.species.get(this.sampleNoReplace(pokemonPool));
			if (!species.exists) continue;

			// Lessen the need of deleting sets of Pokemon after tier shifts
			if (
				this.factoryTier in tierValues && species.tier in tierValues &&
				tierValues[species.tier] > tierValues[this.factoryTier]
			) continue;

			const speciesFlags = this.randomFactorySets[this.factoryTier][species.id].flags;

			// Limit to one of each species (Species Clause)
			if (teamData.baseFormes[species.baseSpecies]) continue;

			// Limit the number of Megas to one
			if (!teamData.megaCount) teamData.megaCount = 0;
			if (teamData.megaCount >= 1 && speciesFlags.megaOnly) continue;

			const set = this.randomFactorySet(species, teamData, this.factoryTier);
			if (!set) continue;

			const itemData = this.dex.items.get(set.item);

			// Actually limit the number of Megas to one
			if (teamData.megaCount >= 1 && itemData.megaStone) continue;

			// Limit the number of Z moves to one
			if (teamData.zCount && teamData.zCount >= 1 && itemData.zMove) continue;

			let types = species.types;
			// Dynamically scale limits for different team sizes. The default and minimum value is 1.
			const limitFactor = Math.round(this.maxTeamSize / 6) || 1;

			// Enforce Monotype
			if (isMonotype) {
				// Prevents Mega Evolutions from breaking the type limits
				if (itemData.megaStone) {
					const megaSpecies = this.dex.species.get(itemData.megaStone);
					if (types.length > megaSpecies.types.length) types = [species.types[0]];
					// Only check the second type because a Mega Evolution should always share the first type with its base forme.
					if (megaSpecies.types[1] && types[1] && megaSpecies.types[1] !== types[1]) {
						types = [megaSpecies.types[0]];
					}
				}
				if (!types.includes(type)) continue;
			} else {
				// If not Monotype, limit to two of each type
				let skip = false;
				for (const typeName of types) {
					if (teamData.typeCount[typeName] >= 2 * limitFactor && this.randomChance(4, 5)) {
						skip = true;
						break;
					}
				}
				if (skip) continue;

				// Limit 1 of any type combination
				let typeCombo = types.slice().sort().join();
				if (set.ability + '' === 'Drought' || set.ability + '' === 'Drizzle') {
				// Drought and Drizzle don't count towards the type combo limit
					typeCombo = set.ability + '';
				}
				if (teamData.typeComboCount[typeCombo] >= 1 * limitFactor) continue;
			}

			// Okay, the set passes, add it to our team
			pokemon.push(set);
			const typeCombo = types.slice().sort().join();
			// Now that our Pokemon has passed all checks, we can update team data:
			for (const typeName of types) {
				if (typeName in teamData.typeCount) {
					teamData.typeCount[typeName]++;
				} else {
					teamData.typeCount[typeName] = 1;
				}
			}
			teamData.typeComboCount[typeCombo] = (teamData.typeComboCount[typeCombo] + 1) || 1;

			teamData.baseFormes[species.baseSpecies] = 1;

			if (itemData.megaStone) teamData.megaCount++;
			if (itemData.zMove) {
				if (!teamData.zCount) teamData.zCount = 0;
				teamData.zCount++;
			}
			if (itemData.id in teamData.has) {
				teamData.has[itemData.id]++;
			} else {
				teamData.has[itemData.id] = 1;
			}

			const abilityState = this.dex.abilities.get(set.ability);
			if (abilityState.id in weatherAbilitiesSet) {
				teamData.weather = weatherAbilitiesSet[abilityState.id];
			}

			for (const move of set.moves) {
				const moveId = toID(move);
				if (moveId in teamData.has) {
					teamData.has[moveId]++;
				} else {
					teamData.has[moveId] = 1;
				}
				if (moveId in requiredMoves) {
					teamData.has[requiredMoves[moveId]] = 1;
				}
			}

			for (const typeName of this.dex.types.names()) {
				// Cover any major weakness (3+) with at least one resistance
				if (teamData.resistances[typeName] >= 1) continue;
				if (resistanceAbilities[abilityState.id]?.includes(typeName) || !this.dex.getImmunity(typeName, types)) {
					// Heuristic: assume that Pokémon with these abilities don't have (too) negative typing.
					teamData.resistances[typeName] = (teamData.resistances[typeName] || 0) + 1;
					if (teamData.resistances[typeName] >= 1) teamData.weaknesses[typeName] = 0;
					continue;
				}
				const typeMod = this.dex.getEffectiveness(typeName, types);
				if (typeMod < 0) {
					teamData.resistances[typeName] = (teamData.resistances[typeName] || 0) + 1;
					if (teamData.resistances[typeName] >= 1) teamData.weaknesses[typeName] = 0;
				} else if (typeMod > 0) {
					teamData.weaknesses[typeName] = (teamData.weaknesses[typeName] || 0) + 1;
				}
			}
		}
		if (pokemon.length < this.maxTeamSize) return this.randomFactoryTeam(side, ++depth);

		// Quality control
		if (!teamData.forceResult) {
			for (const requiredFamily of requiredMoveFamilies) {
				if (!teamData.has[requiredFamily]) return this.randomFactoryTeam(side, ++depth);
			}
			for (const typeName in teamData.weaknesses) {
				if (teamData.weaknesses[typeName] >= 3) return this.randomFactoryTeam(side, ++depth);
			}
		}

		return pokemon;
	}

	randomBSSFactorySets: AnyObject = require('./bss-factory-sets.json');

	randomBSSFactorySet(
		species: Species, teamData: RandomTeamsTypes.FactoryTeamDetails
	): RandomTeamsTypes.RandomFactorySet | null {
		const id = toID(species.name);
		// const flags = this.randomBSSFactorySets[tier][id].flags;
		const setList = this.randomBSSFactorySets[id].sets;

		const movesMax: {[k: string]: number} = {
			batonpass: 1,
			stealthrock: 1,
			spikes: 1,
			toxicspikes: 1,
			doubleedge: 1,
			trickroom: 1,
		};
		const requiredMoves: {[k: string]: number} = {};
		const weatherAbilitiesRequire: {[k: string]: string} = {
			swiftswim: 'raindance',
			sandrush: 'sandstorm', sandveil: 'sandstorm',
		};
		const weatherAbilities = ['drizzle', 'drought', 'snowwarning', 'sandstream'];

		// Build a pool of eligible sets, given the team partners
		// Also keep track of sets with moves the team requires
		let effectivePool: {set: AnyObject, moveVariants?: number[], itemVariants?: number, abilityVariants?: number}[] = [];
		const priorityPool = [];
		for (const curSet of setList) {
			if (this.forceMonotype && !species.types.includes(this.forceMonotype)) continue;

			const item = this.dex.items.get(curSet.item);
			if (teamData.megaCount && teamData.megaCount > 1 && item.megaStone) continue; // reject 3+ mega stones
			if (teamData.zCount && teamData.zCount > 1 && item.zMove) continue; // reject 3+ Z stones
			if (teamData.has[item.id]) continue; // Item clause

			const ability = this.dex.abilities.get(curSet.ability);
			if (weatherAbilitiesRequire[ability.id] && teamData.weather !== weatherAbilitiesRequire[ability.id]) continue;
			if (teamData.weather && weatherAbilities.includes(ability.id)) continue; // reject 2+ weather setters

			if (curSet.species === 'Aron' && teamData.weather !== 'sandstorm') continue; // reject Aron without a Sand Stream user

			let reject = false;
			let hasRequiredMove = false;
			const curSetVariants = [];
			for (const move of curSet.moves) {
				const variantIndex = this.random(move.length);
				const moveId = toID(move[variantIndex]);
				if (movesMax[moveId] && teamData.has[moveId] >= movesMax[moveId]) {
					reject = true;
					break;
				}
				if (requiredMoves[moveId] && !teamData.has[requiredMoves[moveId]]) {
					hasRequiredMove = true;
				}
				curSetVariants.push(variantIndex);
			}
			if (reject) continue;
			effectivePool.push({set: curSet, moveVariants: curSetVariants});
			if (hasRequiredMove) priorityPool.push({set: curSet, moveVariants: curSetVariants});
		}
		if (priorityPool.length) effectivePool = priorityPool;

		if (!effectivePool.length) {
			if (!teamData.forceResult) return null;
			for (const curSet of setList) {
				effectivePool.push({set: curSet});
			}
		}

		const setData = this.sample(effectivePool);
		const moves = [];
		for (const [i, moveSlot] of setData.set.moves.entries()) {
			moves.push(setData.moveVariants ? moveSlot[setData.moveVariants[i]] : this.sample(moveSlot));
		}

		return {
			name: setData.set.nickname || setData.set.name || species.baseSpecies,
			species: setData.set.species,
			gender: setData.set.gender || species.gender || (this.randomChance(1, 2) ? 'M' : 'F'),
			item: this.sampleIfArray(setData.set.item) || '',
			ability: setData.set.ability || species.abilities['0'],
			shiny: typeof setData.set.shiny === 'undefined' ? this.randomChance(1, 1024) : setData.set.shiny,
			level: setData.set.level || 50,
			happiness: typeof setData.set.happiness === 'undefined' ? 255 : setData.set.happiness,
			evs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...setData.set.evs},
			ivs: {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31, ...setData.set.ivs},
			nature: setData.set.nature || 'Serious',
			moves,
		};
	}

	randomBSSFactoryTeam(side: PlayerOptions, depth = 0): RandomTeamsTypes.RandomFactorySet[] {
		this.enforceNoDirectCustomBanlistChanges();

		const forceResult = (depth >= 4);

		const pokemon = [];

		const pokemonPool = Object.keys(this.randomBSSFactorySets);

		const teamData: TeamData = {
			typeCount: {}, typeComboCount: {}, baseFormes: {}, megaCount: 0, zCount: 0,
			eeveeLimCount: 0, has: {}, forceResult, weaknesses: {}, resistances: {},
		};
		const requiredMoveFamilies: string[] = [];
		const requiredMoves: {[k: string]: string} = {};
		const weatherAbilitiesSet: {[k: string]: string} = {
			drizzle: 'raindance',
			drought: 'sunnyday',
			snowwarning: 'hail',
			sandstream: 'sandstorm',
		};
		const resistanceAbilities: {[k: string]: string[]} = {
			waterabsorb: ['Water'],
			flashfire: ['Fire'],
			lightningrod: ['Electric'], voltabsorb: ['Electric'],
			thickfat: ['Ice', 'Fire'],
			levitate: ['Ground'],
		};

		while (pokemonPool.length && pokemon.length < this.maxTeamSize) {
			const species = this.dex.species.get(this.sampleNoReplace(pokemonPool));
			if (!species.exists) continue;

			const speciesFlags = this.randomBSSFactorySets[species.id].flags;
			if (!teamData.megaCount) teamData.megaCount = 0;

			// Limit to one of each species (Species Clause)
			if (teamData.baseFormes[species.baseSpecies]) continue;

			// Limit the number of Megas + Z-moves to 3
			if (teamData.megaCount + (teamData.zCount ? teamData.zCount : 0) >= 3 && speciesFlags.megaOnly) continue;

			// Dynamically scale limits for different team sizes. The default and minimum value is 1.
			const limitFactor = Math.round(this.maxTeamSize / 6) || 1;

			// Limit 2 of any type
			const types = species.types;
			let skip = false;
			for (const type of types) {
				if (teamData.typeCount[type] >= 2 * limitFactor && this.randomChance(4, 5)) {
					skip = true;
					break;
				}
			}
			if (skip) continue;

			// Restrict Eevee with certain Pokemon
			if (speciesFlags.limEevee) {
				if (!teamData.eeveeLimCount) teamData.eeveeLimCount = 0;
				teamData.eeveeLimCount++;
			}
			if (teamData.eeveeLimCount && teamData.eeveeLimCount >= 1 && speciesFlags.limEevee) continue;

			const set = this.randomBSSFactorySet(species, teamData);
			if (!set) continue;

			// Limit 1 of any type combination
			let typeCombo = types.slice().sort().join();
			if (set.ability === 'Drought' || set.ability === 'Drizzle') {
				// Drought and Drizzle don't count towards the type combo limit
				typeCombo = set.ability;
			}
			if (teamData.typeComboCount[typeCombo] >= 1 * limitFactor) continue;

			// Okay, the set passes, add it to our team
			pokemon.push(set);

			// Now that our Pokemon has passed all checks, we can update team data:
			for (const type of types) {
				if (type in teamData.typeCount) {
					teamData.typeCount[type]++;
				} else {
					teamData.typeCount[type] = 1;
				}
			}
			teamData.typeComboCount[typeCombo] = (teamData.typeComboCount[typeCombo] + 1) || 1;

			teamData.baseFormes[species.baseSpecies] = 1;

			// Limit Mega and Z-move
			const itemData = this.dex.items.get(set.item);
			if (itemData.megaStone) teamData.megaCount++;
			if (itemData.zMove) {
				if (!teamData.zCount) teamData.zCount = 0;
				teamData.zCount++;
			}
			teamData.has[itemData.id] = 1;

			const abilityState = this.dex.abilities.get(set.ability);
			if (abilityState.id in weatherAbilitiesSet) {
				teamData.weather = weatherAbilitiesSet[abilityState.id];
			}

			for (const move of set.moves) {
				const moveId = toID(move);
				if (moveId in teamData.has) {
					teamData.has[moveId]++;
				} else {
					teamData.has[moveId] = 1;
				}
				if (moveId in requiredMoves) {
					teamData.has[requiredMoves[moveId]] = 1;
				}
			}

			for (const typeName of this.dex.types.names()) {
				// Cover any major weakness (3+) with at least one resistance
				if (teamData.resistances[typeName] >= 1) continue;
				if (resistanceAbilities[abilityState.id]?.includes(typeName) || !this.dex.getImmunity(typeName, types)) {
					// Heuristic: assume that Pokémon with these abilities don't have (too) negative typing.
					teamData.resistances[typeName] = (teamData.resistances[typeName] || 0) + 1;
					if (teamData.resistances[typeName] >= 1) teamData.weaknesses[typeName] = 0;
					continue;
				}
				const typeMod = this.dex.getEffectiveness(typeName, types);
				if (typeMod < 0) {
					teamData.resistances[typeName] = (teamData.resistances[typeName] || 0) + 1;
					if (teamData.resistances[typeName] >= 1) teamData.weaknesses[typeName] = 0;
				} else if (typeMod > 0) {
					teamData.weaknesses[typeName] = (teamData.weaknesses[typeName] || 0) + 1;
				}
			}
		}
		if (pokemon.length < this.maxTeamSize) return this.randomBSSFactoryTeam(side, ++depth);

		// Quality control
		if (!teamData.forceResult) {
			for (const requiredFamily of requiredMoveFamilies) {
				if (!teamData.has[requiredFamily]) return this.randomBSSFactoryTeam(side, ++depth);
			}
			for (const type in teamData.weaknesses) {
				if (teamData.weaknesses[type] >= 3) return this.randomBSSFactoryTeam(side, ++depth);
			}
		}

		return pokemon;
	}
}

export default RandomGen7Teams;
