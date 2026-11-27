import * as T from 'three';

/** Low-cost outdoor reflection panorama; not used as the visible sky. */
export function reflectionSky(): T.DataTexture {
  const width=128,height=64,data=new Uint8Array(width*height*4);
  const horizon=new T.Color(0xd5d9d8),zenith=new T.Color(0x6f9bc6),ground=new T.Color(0x514b43);
  const color=new T.Color(),srgb=new T.Color();
  for(let y=0;y<height;y++){
    const elevation=Math.sin(Math.PI*((y+.5)/height-.5));
    for(let x=0;x<width;x++){
      color.copy(horizon).lerp(elevation>=0?zenith:ground,Math.pow(Math.abs(elevation),.65));
      if(elevation>0){
        const azimuth=(x+.5)/width*2*Math.PI;
        const cloud=Math.max(0,Math.sin(azimuth*4+elevation*8)*Math.cos(azimuth*3-elevation*7))*.14*(1-elevation);
        color.lerp(horizon,cloud);
      }
      srgb.copy(color).convertLinearToSRGB();
      const i=(y*width+x)*4;
      data[i]=Math.round(srgb.r*255);data[i+1]=Math.round(srgb.g*255);data[i+2]=Math.round(srgb.b*255);data[i+3]=255;
    }
  }
  const texture=new T.DataTexture(data,width,height);
  texture.colorSpace=T.SRGBColorSpace;texture.mapping=T.EquirectangularReflectionMapping;
  texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearFilter;texture.needsUpdate=true;
  return texture;
}
