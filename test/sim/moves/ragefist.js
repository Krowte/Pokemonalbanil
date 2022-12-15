'use strict';

const assert = require('./../../assert');
const common = require('./../../common');

let battle;

describe.only('Rage Fist', function () {
	afterEach(function () {
		battle.destroy();
	});

	it('should increase BP by 50 when user hit', function () {
		battle = common.createBattle([
			[{species: 'Primeape', ability: 'vitalspirit', moves: ['ragefist']}],
			[{species: 'Umbreon', ability: 'shellarmor', moves: ['tackle']}],
		]);
		battle.makeChoices();
		let rageFistDamage = battle.p2.active[0].maxhp - battle.p2.active[0].hp;
		assert.bounded(rageFistDamage, [17, 21]);
		battle.makeChoices();
		rageFistDamage = battle.p2.active[0].maxhp - rageFistDamage - battle.p2.active[0].hp;
		assert.bounded(rageFistDamage, [34, 41]);
	});

	it('should not increase BP after being hit by status moves', function () {
		battle = common.createBattle([
			[{species: 'Primeape', ability: 'vitalspirit', moves: ['ragefist']}],
			[{species: 'Umbreon', ability: 'shellarmor', moves: ['taunt']}],
		]);
		battle.makeChoices();
		let rageFistDamage = battle.p2.active[0].maxhp - battle.p2.active[0].hp;
		assert.bounded(rageFistDamage, [17, 21]);
		battle.makeChoices();
		rageFistDamage = battle.p2.active[0].maxhp - rageFistDamage - battle.p2.active[0].hp;
		assert.bounded(rageFistDamage, [17, 21]);
	});

	it('should increase BP after each hit of multi-hit moves', function () {
		battle = common.createBattle([
			[{species: 'Primeape', ability: 'vitalspirit', moves: ['sleeptalk', 'ragefist']}],
			[{species: 'Umbreon', ability: 'shellarmor', moves: ['doublehit', 'sleeptalk']},
			]]);
		battle.makeChoices();
		battle.makeChoices('move ragefist', 'move sleeptalk');
		assert.bounded(battle.p2.active[0].maxhp - battle.p2.active[0].hp, [52, 61]);
	});

	it('should use user\'s own number of times hit when called by another move', function () {
		battle = common.createBattle([[{species: 'Primeape', ability: 'vitalspirit', moves: ['ragefist']}], [{species: 'Umbreon', moves: ['copycat']}]]);
		battle.makeChoices();
		assert.bounded(battle.p1.active[0].maxhp - battle.p1.active[0].hp, [77, 91]);
	});

	it(`should not increase BP when healed by an ally's Pollen Puff`, function () {
		battle = common.createBattle({gameType: 'doubles'}, [[
			{species: 'Wynaut', moves: ['pollenpuff']},
			{species: 'Annihilape', moves: ['sleeptalk', 'bellydrum']},
		], [
			{species: 'Wobbuffet', moves: ['sleeptalk']},
			{species: 'Lucario', moves: ['sleeptalk']},
		]]);

		const annihilape = battle.p1.active[1];
		battle.makeChoices('move pollenpuff -2, move sleeptalk', 'auto');
		assert.equal(annihilape.timesAttacked, 0, `timesAttacked should not have incremented after a full HP Pollen Puff`);

		battle.makeChoices('move pollenpuff -2, move bellydrum', 'auto');
		assert.equal(annihilape.timesAttacked, 0, `timesAttacked should not have incremented after a not-full HP Pollen Puff`);
	});
});
