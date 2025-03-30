// matrix.js

(function() {
    // Get canvas and its drawing context
    const canvas = document.getElementById('matrixCanvas');
    const ctx = canvas.getContext('2d');
  
    // Parameters for the dots and effect
    const dotRadius = 2;
    const dotSpacing = 50;
    const effectRadius = 200; // Radius around the cursor for the magnification effect
    let dots = [];
    let mousePos = { x: -1000, y: -1000 };
  
    // Adjust canvas size to fill the viewport
    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      createDots();
    }
  
    // Create a grid of dots based on the canvas size and spacing
    function createDots() {
      dots = [];
      for (let x = 0; x < canvas.width; x += dotSpacing) {
        for (let y = 0; y < canvas.height; y += dotSpacing) {
          dots.push({ x, y });
        }
      }
    }
  
    // Update mouse position for the magnification effect
    window.addEventListener('mousemove', function(e) {
      mousePos.x = e.clientX;
      mousePos.y = e.clientY;
    });
  
    // Resize canvas on window resize
    window.addEventListener('resize', resizeCanvas);
  
    // Draw the dot grid and update each dot's size based on its distance to the cursor
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
  
      // Determine dot color based on light/dark mode
      const dotColor = document.body.classList.contains('dark-mode') ? '#ffffff' : '#000000';
  
      dots.forEach(dot => {
        // Calculate distance from dot to the current mouse position
        const dx = dot.x - mousePos.x;
        const dy = dot.y - mousePos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
  
        // Calculate scaling factor for magnification
        let scale = 1;
        if (distance < effectRadius) {
          scale = 1 + (effectRadius - distance) / effectRadius;
        }
  
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dotRadius * scale, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();
      });
  
      requestAnimationFrame(draw);
    }
  
    // Initialize canvas and start the animation loop
    resizeCanvas();
    draw();
  })();
  