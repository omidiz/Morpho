import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const ctx = canvas.getContext('2d')!;

// Placeholder: size the canvas to the screen at device resolution and
// paint a soft gradient until the first pattern module lands.
function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  draw();
}

function draw(): void {
  const { width, height } = canvas;
  const g = ctx.createRadialGradient(
    width / 2, height / 2, 0,
    width / 2, height / 2, Math.hypot(width, height) / 2,
  );
  g.addColorStop(0, '#2b3a35');
  g.addColorStop(1, '#0e0f12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

new ResizeObserver(resize).observe(canvas);
