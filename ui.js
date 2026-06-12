document.addEventListener('DOMContentLoaded', () => {
  const sparks = document.getElementById('sparks');
  if (!sparks) return;

  const particles = [];
  const count = 110;

  function createParticles() {
    sparks.innerHTML = '';
    particles.length = 0;

    const w = sparks.clientWidth;
    const h = sparks.clientHeight;

    for (let i = 0; i < count; i++) {
      const el = document.createElement('span');

      const size = 1.5 + Math.random() * 2;

      el.className = 'ax9-spark';
      el.style.position = 'absolute';
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.style.borderRadius = '50%';
      el.style.background = '#fff';
      el.style.boxShadow = '0 0 2px #fff, 0 0 6px rgba(255,255,255,.35)';
      el.style.opacity = 0.15 + Math.random() * 0.35;

      const x = Math.random() * w;
      const y = Math.random() * h;

      el.style.left = x + 'px';
      el.style.top = y + 'px';

      particles.push({
        el,
        x,
        y,
        vx: (Math.random() - 0.5) * 0.06,
        vy: (Math.random() - 0.5) * 0.06
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

      if (p.x < -5) p.x = w + 5;
      if (p.x > w + 5) p.x = -5;

      if (p.y < -5) p.y = h + 5;
      if (p.y > h + 5) p.y = -5;

      p.el.style.transform = `translate3d(${p.x}px,${p.y}px,0)`;
    }

    requestAnimationFrame(animate);
  }

  createParticles();
  animate();

  window.addEventListener('resize', createParticles);
});
