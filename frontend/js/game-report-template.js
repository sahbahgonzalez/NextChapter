/**
 * Game Report Template JavaScript
 * Handles shot chart visualization and PDF generation for the template
 */

// Draw shots on SVG overlay
function drawShotsOnSVG(overlayId, shots) {
    const overlay = document.getElementById(overlayId);
    const wrapper = overlay.parentElement;

    // Set SVG viewBox and dimensions to match the court
    overlay.setAttribute('viewBox', '0 0 1024 937');
    overlay.setAttribute('width', '1024');
    overlay.setAttribute('height', '937');

    // Make SVG take up full parent space
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';

    // Create a group for shots
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('id', 'shots-group');

    shots.forEach(shot => {
        // Shot coordinates are in 0-100 scale, convert to 0-1024/937 scale
        const svgX = (shot.x / 100) * 1024;
        const svgY = (shot.y / 100) * 937;

        if (shot.made) {
            // Made shot - green circle
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', svgX);
            circle.setAttribute('cy', svgY);
            circle.setAttribute('r', '25');
            circle.setAttribute('fill', 'rgba(56, 161, 105, 0.6)');
            circle.setAttribute('stroke', '#22543d');
            circle.setAttribute('stroke-width', '3');
            group.appendChild(circle);
        } else {
            // Missed shot - red X
            const size = 20;
            const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line1.setAttribute('x1', svgX - size);
            line1.setAttribute('y1', svgY - size);
            line1.setAttribute('x2', svgX + size);
            line1.setAttribute('y2', svgY + size);
            line1.setAttribute('stroke', 'rgba(229, 62, 62, 0.8)');
            line1.setAttribute('stroke-width', '4');
            line1.setAttribute('stroke-linecap', 'round');

            const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line2.setAttribute('x1', svgX + size);
            line2.setAttribute('y1', svgY - size);
            line2.setAttribute('x2', svgX - size);
            line2.setAttribute('y2', svgY + size);
            line2.setAttribute('stroke', 'rgba(229, 62, 62, 0.8)');
            line2.setAttribute('stroke-width', '4');
            line2.setAttribute('stroke-linecap', 'round');

            group.appendChild(line1);
            group.appendChild(line2);
        }
    });

    overlay.appendChild(group);
}

// Player 1 shot data
const player1Shots = [
    { x: 50, y: 30, made: true },
    { x: 55, y: 35, made: false },
    { x: 48, y: 25, made: true },
    { x: 60, y: 45, made: true },
    { x: 40, y: 40, made: false },
    { x: 50, y: 60, made: true },
    { x: 45, y: 50, made: true },
    { x: 52, y: 32, made: false },
    { x: 58, y: 28, made: true },
    { x: 42, y: 55, made: true }
];

// Player 2 shot data
const player2Shots = [
    { x: 48, y: 28, made: true },
    { x: 52, y: 38, made: false },
    { x: 50, y: 32, made: true },
    { x: 56, y: 40, made: false },
    { x: 44, y: 50, made: true },
    { x: 55, y: 60, made: true },
    { x: 47, y: 45, made: false },
    { x: 51, y: 35, made: true },
    { x: 49, y: 58, made: false },
    { x: 54, y: 42, made: true },
    { x: 46, y: 32, made: true }
];

// Initialize when page loads
window.addEventListener('load', function() {
    // Draw shots
    drawShotsOnSVG('overlay1', player1Shots);
    drawShotsOnSVG('overlay2', player2Shots);
});

// Generate PDF
function generatePDF() {
    const element = document.querySelector('.report-container');
    const opt = {
        margin: 10,
        filename: 'game-report.pdf',
        image: { type: 'png', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };
    html2pdf().set(opt).from(element).save();
}
