let bytes;
export async function modelBytes() {
  if (!bytes)
    bytes = (async () => {
      const data = document.querySelector("#model")?.textContent.trim();
      if (data) {
        const s = atob(data),
          a = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
        return a.buffer;
      }
      const r = await fetch("./room-tone.glb");
      if (!r.ok) throw Error("캐릭터 모델 다운로드 실패");
      return await r.arrayBuffer();
    })().catch((e) => {
      bytes = null;
      throw e;
    });
  return bytes;
}
