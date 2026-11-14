const games = [
  ['LAST CITY', () => import('./city/game').then(({ openCity }) => openCity)],
  ['SPEED RUSH', () => import('./race/game').then(({ openRace }) => openRace)],
] as const;

const app = document.querySelector<HTMLDivElement>('#game')!;

function showMenu(): void {
  app.hidden = false;
  app.replaceChildren();
  const title = document.createElement('h1');
  title.textContent = 'WALDO';
  app.append(title);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  for (const [label, load] of games) {
    const launch = document.createElement('button');
    launch.type = 'button';
    launch.textContent = label;
    launch.onclick = async () => {
      app.querySelectorAll('button').forEach(button => { button.disabled = true; });
      try {
        const start = await load();
        app.hidden = true;
        start(showMenu);
      } catch {
        showMenu();
        app.querySelector('[role="status"]')!.textContent = '게임을 불러오지 못했습니다. 다시 시도해 주세요.';
      }
    };
    app.append(launch);
  }
  app.append(status);
}

showMenu();
