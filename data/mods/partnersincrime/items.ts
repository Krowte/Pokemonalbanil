export const Items: {[k: string]: ModdedItemData} = {
	adrenalineorb: {
		inherit: true,
		onAfterBoost(boost, target, source, effect) {
			if (effect.id === 'intimidate' || effect.id === 'ability:intimidate') {
				target.useItem();
			}
		},
	},
	leppaberry: {
		inherit: true,
		onEat(pokemon) {
			const moveSlot = pokemon.moveSlots.find(move => move.pp === 0) ||
				pokemon.moveSlots.find(move => move.pp < move.maxpp);
			if (!moveSlot) return;
			moveSlot.pp += 10;
			if (moveSlot.pp > moveSlot.maxpp) moveSlot.pp = moveSlot.maxpp;
			if (!pokemon.m.curMoves.includes(moveSlot.id) && pokemon.m.trackPP.get(moveSlot.id)) {
				pokemon.m.trackPP.set(moveSlot.id, moveSlot.maxpp - moveSlot.pp);
			}
			this.add('-activate', pokemon, 'item: Leppa Berry', moveSlot.move, '[consumed]');
		},
	},
	protectivepads: {
		inherit: true,
		onSetAbility(ability, target, source, effect) {
			if (target !== source && target === this.activePokemon && this.activeMove && this.activeMove.flags['contact']) {
				if (effect && effect.effectType === 'Ability' && !effect.id.endsWith('wanderingspirit')) {
					this.add('-activate', source, effect.fullname);
					this.add('-activate', target, 'item: Protective Pads');
				}
				return false;
			}
		},
	},
};
