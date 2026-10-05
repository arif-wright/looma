import { MapSchema, Schema, type } from '@colyseus/schema';

export class PlayerState extends Schema {
  @type('string') mapId = 'wilds-exploration';
  @type('uint32') transitionRevision = 0;
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('boolean') connected = true;
  @type('uint32') acknowledgedSequence = 0;
  @type('uint8') colorIndex = 0;
  @type('string') displayName = 'Explorer';
  @type('string') handle = '';
  @type('string') playerBody = 'male';
  @type('boolean') companionPresent = false;
  @type('string') companionName = '';
  @type('string') companionKind = '';
  @type('string') companionStatus = 'unavailable';
  @type('uint32') companionRevision = 0;
}

export class NpcState extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('string') mapId = 'wilds-exploration';
  @type('string') kind = 'resident';
  @type('string') playerBody = 'male';
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('boolean') moving = false;
}

export class WorldState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: NpcState }) npcs = new MapSchema<NpcState>();
  @type('uint32') tick = 0;
}
