document.addEventListener('DOMContentLoaded', () => {
  const sparks = document.getElementById('sparks');
  if (!sparks) return;

  const particles = [];
  const frag = document.createDocumentFragment();

  const count = Math.max(
    100,
    Math.floor((innerWidth * innerHeight) / 8000)
  );

  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.className = 'ax9-spark';

    const size = 0.5 + Math.random() * 2.5;

    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.opacity = 0.15 + Math.random() * 0.85;

    particles.push({
      el,
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vx: (Math.random() - 0.5) * 0.06,
      vy: (Math.random() - 0.5) * 0.06
    });

    frag.appendChild(el);
  }

  sparks.appendChild(frag);

  function loop() {
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -20) p.x = innerWidth + 20;
      if (p.x > innerWidth + 20) p.x = -20;
      if (p.y < -20) p.y = innerHeight + 20;
      if (p.y > innerHeight + 20) p.y = -20;

      p.el.style.transform =
        `translate3d(${p.x}px,${p.y}px,0)`;
    }

    requestAnimationFrame(loop);
  }

  loop();
});
