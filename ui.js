document.addEventListener('DOMContentLoaded', function () {
      var sparks = document.getElementById('sparks');
      if (!sparks) return;

      var count = 42;
      var frag = document.createDocumentFragment();

      for (var i = 0; i < count; i++) {
        var spark = document.createElement('span');
        spark.className = 'ax9-spark';

        var left = Math.random() * 100;
        var top = Math.random() * 100;
        var size = 1 + Math.random() * 2;
        var opacity = 0.25 + Math.random() * 0.75;

        spark.style.left = left + '%';
        spark.style.top = top + '%';
        spark.style.width = size + 'px';
        spark.style.height = size + 'px';
        spark.style.opacity = opacity.toFixed(2);

        frag.appendChild(spark);
      }

      sparks.appendChild(frag);
    });
