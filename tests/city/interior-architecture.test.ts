import {describe,expect,it} from 'vitest';
import {architecturePlan} from '../../src/city/interior-architecture';
import {INTERIORS,DOOR_HALF} from '../../src/city/interior';
describe('LAST CITY interior architecture',()=>{
  it('keeps all boxes in the shell without obstructing the entrance',()=>{
    for(const lay of Object.values(INTERIORS))for(const quality of ['low','standard','high'] as const){
      const boxes=architecturePlan(lay,quality);expect(boxes.length).toBeLessThan(80);
      for(const b of boxes){
        expect(b.x0>=0&&b.y0>=0&&b.z0>=0&&b.x1<=lay.w&&b.y1<=lay.h&&b.z1<=lay.d).toBe(true);
        expect(b.x1>b.x0&&b.y1>b.y0&&b.z1>b.z0).toBe(true);
        if(b.z1>lay.d-3&&b.y0<48)expect(b.x1<=lay.w/2-DOOR_HALF||b.x0>=lay.w/2+DOOR_HALF).toBe(true);
      }
    }
  });
  it('uses quality budgets and visibly different layouts',()=>{
    for(const lay of Object.values(INTERIORS)){
      expect(architecturePlan(lay,'low').length).toBeLessThan(architecturePlan(lay,'standard').length);
      expect(architecturePlan(lay,'standard').length).toBeLessThanOrEqual(architecturePlan(lay,'high').length);
    }
    expect(architecturePlan(INTERIORS.bank,'high')).not.toEqual(architecturePlan(INTERIORS.plant,'high'));
  });
});
