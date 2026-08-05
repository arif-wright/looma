import { MapSchema, Schema, type } from '@colyseus/schema';

export class PlayerState extends Schema {
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

export class WorldState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type('uint32') tick = 0;
}
