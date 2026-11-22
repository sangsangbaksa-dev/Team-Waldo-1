import {buildMapTrack,type Track} from './track';
import type {MapDef} from './maps';

/** Retain only the currently selected track; restarting a race must not rebuild its spline. */
export class RecentRaceTrack {
  private id:string|null=null;
  private track:Track|null=null;
  get(map:MapDef):Track {
    if (this.track && this.id===map.id) return this.track;
    this.track=buildMapTrack(map);
    this.id=map.id;
    return this.track;
  }
}
