document.addEventListener('DOMContentLoaded', () => {
  const sparks = document.getElementById('sparks');
  if (!sparks) return;

  const particles = [];
  const frag = document.createDocumentFragment();

  for (let i = 0; i < 42; i++) {
    const el = document.createElement('span');
    el.className = 'ax9-spark';

    particles.push({
      el,
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vx: (Math.random() - 0.5) * 0.08,
      vy: (Math.random() - 0.5) * 0.08
    });

    frag.appendChild(el);
  }

  sparks.appendChild(frag);

  function loop() {
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -10) p.x = innerWidth + 10;
      if (p.x > innerWidth + 10) p.x = -10;
      if (p.y < -10) p.y = innerHeight + 10;
      if (p.y > innerHeight + 10) p.y = -10;

      p.el.style.transform =
        `translate3d(${p.x}px,${p.y}px,0)`;
    }

    requestAnimationFrame(loop);
  }

  loop();
});
