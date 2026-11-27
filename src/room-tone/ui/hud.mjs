export function renderRoomHud($, { zone, objective, lightOn, crouched }) {
  $("zone").textContent = zone;
  $("objective").textContent = objective;
  $("lightState").textContent = lightOn ? "켜짐" : "꺼짐";
  $("crouch").setAttribute("aria-pressed", String(crouched));
}
