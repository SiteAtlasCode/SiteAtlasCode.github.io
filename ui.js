document.addEventListener('DOMContentLoaded', () => {
  const sparks = document.getElementById('sparks');
  if (!sparks) return;

  const particles = [];
  const count = 220;

  function createParticles() {
    sparks.innerHTML = '';
    particles.length = 0;

    const w = sparks.clientWidth;
    const h = sparks.clientHeight;

    for (let i = 0; i < count; i++) {
      const el = document.createElement('span');

      const size = 2 + Math.random() * 3;

      el.className = 'ax9-spark';
      el.style.position = 'absolute';
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.style.borderRadius = '50%';
      el.style.background = '#fff';
      el.style.boxShadow = '0 0 3px #fff, 0 0 10px rgba(255,255,255,.7)';
      el.style.opacity = 0.4 + Math.random() * 0.6;

      const x = Math.random() * w;
      const y = Math.random() * h;

      el.style.left = x + 'px';
      el.style.top = y + 'px';

      particles.push({
        el,
        x,
        y,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25
      });

      sparks.appendChild(el);
    }
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

  createParticles();
  animate();

  window.addEventListener('resize', createParticles);
});
