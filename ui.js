(function () {
      const sparks = document.getElementById('sparks');
      const count = Math.min(12, Math.max(8, Math.floor(window.innerWidth / 125)));
      for (let i = 0; i < count; i++) {
        const s = document.createElement('span');
        s.className = 'spark';
        s.style.left = Math.random() * 100 + 'vw';
        s.style.top = (82 + Math.random() * 20) + 'vh';
        s.style.setProperty('--dx', ((Math.random() * 2 - 1) * 120) + 'px');
        s.style.animationDelay = (Math.random() * 3.2) + 's';
        s.style.opacity = (0.18 + Math.random() * 0.72).toFixed(2);
        sparks.appendChild(s);
      }
    })();
