import type * as Three from "three";
export function buildStationArt(THREE:typeof Three,root:Three.Group,chapter:number,bright:Three.Material,dark:Three.Material,steel:Three.Material):void;
export function makeContactTexture(THREE:typeof Three):Three.CanvasTexture;
export function addContactShadow(THREE:typeof Three,root:Three.Group,width:number,depth:number,texture:Three.Texture):Three.Mesh<Three.PlaneGeometry,Three.MeshBasicMaterial>;

export function buildCollectibleArt(THREE:typeof Three,root:Three.Group,chapter:number,index:number,bright:Three.Material,dark:Three.Material,steel:Three.Material):void;

export function buildExitDoorArt(THREE:typeof Three,root:Three.Group,bright:Three.Material,dark:Three.Material,steel:Three.Material):void;
