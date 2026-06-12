document.addEventListener('DOMContentLoaded', () => {
  const sparks = document.getElementById('sparks');
  if (!sparks) return;

  const particles = [];
  const count = 200;

  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');

    const size = 1 + Math.random() * 2;

    el.className = 'ax9-spark';
    el.style.position = 'absolute';
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.opacity = 0.2 + Math.random() * 0.8;

    const x = Math.random() * sparks.clientWidth;
    const y = Math.random() * sparks.clientHeight;

    el.style.left = x + 'px';
    el.style.top = y + 'px';

    particles.push({
      el,
      x,
      y,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15
    });

    sparks.appendChild(el);
  }

  function animate() {
    const w = sparks.clientWidth;
    const h = sparks.clientHeight;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;

      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;

      p.el.style.left = p.x + 'px';
      p.el.style.top = p.y + 'px';
    }

    requestAnimationFrame(animate);
  }

  animate();
});
