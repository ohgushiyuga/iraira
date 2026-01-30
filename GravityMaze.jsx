import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import './GravityMaze.css';

const { Engine, Runner, Bodies, Composite, Events, Body, Vector } = Matter;

const CONFIG = {
    baseCols: 10,
    baseRows: 8,
    sizeMultiplier: 1,
    colors: {
        wall: '#333333',
        player: '#00ffff',
        goal: '#4ecdc4',
        bg: '#0a0a0a',
        hazard: '#ff0000'
    },
    hazardDensity: 0.15
};

const GravityMaze = () => {
    const canvasRef = useRef(null);
    const engineRef = useRef(null);
    const runnerRef = useRef(null);
    const requestRef = useRef(null);
    
    // Game State
    const [level, setLevel] = useState(1);
    const [deaths, setDeaths] = useState(0);
    const [gameStatus, setGameStatus] = useState('playing'); // playing, clear, gameover
    const [statusMessage, setStatusMessage] = useState('');
    
    // Refs for game objects that need to be accessed in the loop without triggering re-renders
    const gameState = useRef({
        width: 0,
        height: 0,
        level: 1,
        deaths: 0,
        isTransitioning: false,
        player: null,
        hazards: []
    });

    useEffect(() => {
        // Initialization
        const container = canvasRef.current.parentElement;
        const width = window.innerWidth;
        const height = window.innerHeight;
        gameState.current.width = width;
        gameState.current.height = height;

        const engine = Engine.create();
        engine.world.gravity.y = 1;
        engineRef.current = engine;

        const runner = Runner.create();
        Runner.run(runner, engine);
        runnerRef.current = runner;

        // Canvas setup
        const canvas = canvasRef.current;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Input handling
        // We define handleInput here or outside. 
        // Need access to engine.
        const handleInput = (e) => {
            if (gameState.current.isTransitioning) return;
            if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].indexOf(e.code) > -1) e.preventDefault();

            const g = 1.5; 
            const world = engine.world;

            switch (e.key) {
                case 'ArrowUp':    world.gravity.x = 0; world.gravity.y = -g; break;
                case 'ArrowDown':  world.gravity.x = 0; world.gravity.y = g; break;
                case 'ArrowLeft':  world.gravity.x = -g; world.gravity.y = 0; break;
                case 'ArrowRight': world.gravity.x = g; world.gravity.y = 0; break;
                // 'R' retry handled via React state or direct call? 
                // Let's use direct call for now to match logic structure
                case 'r':
                case 'R':
                    startLevel(); 
                    break;
            }
        };
        window.addEventListener('keydown', handleInput);
        window.addEventListener('resize', () => window.location.reload()); // Simple resize handling

        // Start Level Logic
        const generateMaze = (cols, rows) => {
            const grid = [];
            for (let y = 0; y < rows; y++) {
                const row = [];
                for (let x = 0; x < cols; x++) {
                    row.push({ x, y, visited: false, right: true, bottom: true });
                }
                grid.push(row);
            }
            const stack = [];
            const start = grid[0][0];
            start.visited = true;
            stack.push(start);
            while (stack.length > 0) {
                const current = stack[stack.length - 1];
                const neighbors = [];
                if (current.y > 0 && !grid[current.y - 1][current.x].visited) neighbors.push('top');
                if (current.x < cols - 1 && !grid[current.y][current.x + 1].visited) neighbors.push('right');
                if (current.y < rows - 1 && !grid[current.y + 1][current.x].visited) neighbors.push('bottom');
                if (current.x > 0 && !grid[current.y][current.x - 1].visited) neighbors.push('left');

                if (neighbors.length > 0) {
                    const nextDir = neighbors[Math.floor(Math.random() * neighbors.length)];
                    let next;
                    if (nextDir === 'top') { next = grid[current.y - 1][current.x]; grid[current.y - 1][current.x].bottom = false; }
                    else if (nextDir === 'right') { next = grid[current.y][current.x + 1]; current.right = false; }
                    else if (nextDir === 'bottom') { next = grid[current.y + 1][current.x]; current.bottom = false; }
                    else if (nextDir === 'left') { next = grid[current.y][current.x - 1]; grid[current.y][current.x - 1].right = false; }
                    next.visited = true;
                    stack.push(next);
                } else { stack.pop(); }
            }
            return grid;
        };

        const startLevel = () => {
            Composite.clear(engine.world);
            engine.events = {};
            
            engine.world.gravity.x = 0;
            engine.world.gravity.y = 1;

            const lvl = gameState.current.level;
            const currentCols = CONFIG.baseCols + Math.floor((lvl - 1)); 
            const currentRows = CONFIG.baseRows + Math.floor((lvl - 1));

            const cellW = width / currentCols;
            const cellH = height / currentRows;
            const wallThickness = Math.min(cellW, cellH) * 0.1;
            
            const maze = generateMaze(currentCols, currentRows);
            const walls = [];

            // Borders
            walls.push(Bodies.rectangle(width/2, -wallThickness/2, width, wallThickness, { isStatic: true, render: { fillStyle: CONFIG.colors.wall } }));
            walls.push(Bodies.rectangle(width/2, height+wallThickness/2, width, wallThickness, { isStatic: true, render: { fillStyle: CONFIG.colors.wall } }));
            walls.push(Bodies.rectangle(-wallThickness/2, height/2, wallThickness, height, { isStatic: true, render: { fillStyle: CONFIG.colors.wall } }));
            walls.push(Bodies.rectangle(width+wallThickness/2, height/2, wallThickness, height, { isStatic: true, render: { fillStyle: CONFIG.colors.wall } }));

            const possibleTrapLocations = [];

            for (let y = 0; y < currentRows; y++) {
                for (let x = 0; x < currentCols; x++) {
                    const cell = maze[y][x];
                    const cx = x * cellW + cellW/2;
                    const cy = y * cellH + cellH/2;

                    if (cell.right) {
                        walls.push(Bodies.rectangle(cx + cellW/2, cy, wallThickness, cellH + wallThickness, { isStatic: true, render: { fillStyle: CONFIG.colors.wall } }));
                    }
                    if (cell.bottom) {
                        walls.push(Bodies.rectangle(cx, cy + cellH/2, cellW + wallThickness, wallThickness, { isStatic: true, render: { fillStyle: CONFIG.colors.wall } }));
                    }

                    const distStart = Math.sqrt(x*x + y*y);
                    const distEnd = Math.sqrt((currentCols-1-x)**2 + (currentRows-1-y)**2);
                    
                    if (distStart > 2 && distEnd > 2) {
                        possibleTrapLocations.push({x: cx, y: cy, gridX: x, gridY: y});
                    }
                }
            }
            Composite.add(engine.world, walls);

            // Traps
            const targetHazardCount = Math.floor(possibleTrapLocations.length * CONFIG.hazardDensity);
            for (let i = possibleTrapLocations.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [possibleTrapLocations[i], possibleTrapLocations[j]] = [possibleTrapLocations[j], possibleTrapLocations[i]];
            }
            
            const hazards = [];
            const placedTraps = []; 
            const trapSize = Math.min(cellW, cellH) * 0.25;
            
            for(let i=0; i < possibleTrapLocations.length && hazards.length < targetHazardCount; i++) {
                const loc = possibleTrapLocations[i];
                
                if (lvl < 10) {
                    const isAdjacent = placedTraps.some(pt => {
                        return Math.abs(pt.x - loc.gridX) + Math.abs(pt.y - loc.gridY) <= 1;
                    });
                    if (isAdjacent) continue;
                }

                const hazard = Bodies.rectangle(loc.x, loc.y, trapSize, trapSize, {
                    isStatic: true,
                    isSensor: true,
                    label: 'hazard',
                    angle: Math.PI / 4,
                    render: { fillStyle: CONFIG.colors.hazard }
                });
                
                hazard.rotationSpeed = (Math.random() - 0.5) * 0.1;
                hazards.push(hazard);
                placedTraps.push({x: loc.gridX, y: loc.gridY});
            }
            Composite.add(engine.world, hazards);
            gameState.current.hazards = hazards;

            // Player
            const pSize = Math.min(cellW, cellH) * 0.35; 
            const player = Bodies.rectangle(
                cellW/2, cellH/2, 
                pSize, pSize, 
                { 
                    friction: 0.000,
                    frictionAir: 0.005,
                    restitution: 0.7,
                    render: { fillStyle: CONFIG.colors.player },
                    label: 'player'
                }
            );
            Composite.add(engine.world, player);
            gameState.current.player = player;

            // Goal
            const goal = Bodies.rectangle(
                width - cellW/2, height - cellH/2, 
                pSize * 1.5, pSize * 1.5, 
                { 
                    isStatic: true, 
                    isSensor: true, 
                    render: { fillStyle: CONFIG.colors.goal },
                    label: 'goal'
                }
            );
            Composite.add(engine.world, goal);

            // Events
            Events.on(engine, 'collisionStart', (event) => {
                if (gameState.current.isTransitioning) return;

                const pairs = event.pairs;
                for (let i = 0; i < pairs.length; i++) {
                    const bodyA = pairs[i].bodyA;
                    const bodyB = pairs[i].bodyB;
                    const labels = [bodyA.label, bodyB.label];

                    if (labels.includes('player') && labels.includes('goal')) {
                        winLevel();
                    }
                    if (labels.includes('player') && labels.includes('hazard')) {
                        loseLevel();
                    }
                }
            });

            Events.on(engine, 'beforeUpdate', () => {
                 hazards.forEach(h => {
                     Body.rotate(h, 0.05);
                 });
            });

            gameState.current.isTransitioning = false;
            setGameStatus('playing');
        };

        const winLevel = () => {
            if (gameState.current.isTransitioning) return;
            gameState.current.isTransitioning = true;
            
            setGameStatus('clear');
            setStatusMessage("STAGE CLEAR!");
            
            setTimeout(() => {
                setLevel(l => {
                    const next = l + 1;
                    gameState.current.level = next;
                    return next;
                });
                startLevel();
            }, 1200);
        };

        const loseLevel = () => {
            if (gameState.current.isTransitioning) return;
            gameState.current.isTransitioning = true;
            
            // Visual effect
            if (gameState.current.player) {
                gameState.current.player.render.fillStyle = '#ff0000';
            }
            
            setDeaths(d => {
                const next = d + 1;
                gameState.current.deaths = next;
                return next;
            });

            setGameStatus('gameover');
            setStatusMessage("GAME OVER");

            setTimeout(() => {
                startLevel();
            }, 1000);
        };

        // Render Loop
        const drawGravityArrow = (ctx, width, height) => {
            const gx = engine.world.gravity.x;
            const gy = engine.world.gravity.y;
            if (gx === 0 && gy === 0) return;

            const size = 100;
            const centerX = width / 2;
            const centerY = height / 2;

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.globalAlpha = 0.15;
            const angle = Math.atan2(gy, gx);
            ctx.rotate(angle);

            ctx.beginPath();
            ctx.moveTo(-size/2, -size/2); 
            ctx.lineTo(size/2, 0);       
            ctx.lineTo(-size/2, size/2);  
            ctx.lineTo(-size/2 + 20, 0); 
            ctx.closePath();
            
            ctx.fillStyle = '#ff3333';
            ctx.fill();
            ctx.restore();
        };

        const render = () => {
            const width = gameState.current.width;
            const height = gameState.current.height;
            
            ctx.fillStyle = CONFIG.colors.bg;
            ctx.fillRect(0, 0, width, height);

            const bodies = Composite.allBodies(engine.world);
            
            bodies.forEach(body => {
                ctx.beginPath();
                const vertices = body.vertices;
                ctx.moveTo(vertices[0].x, vertices[0].y);
                for (let j = 1; j < vertices.length; j += 1) {
                    ctx.lineTo(vertices[j].x, vertices[j].y);
                }
                ctx.lineTo(vertices[0].x, vertices[0].y);

                if (body.label === 'player') {
                    ctx.fillStyle = body.render.fillStyle;
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = body.render.fillStyle;
                } else if (body.label === 'hazard') {
                    ctx.fillStyle = CONFIG.colors.hazard;
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#ff0000';
                } else if (body.label === 'goal') {
                    ctx.fillStyle = CONFIG.colors.goal;
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = CONFIG.colors.goal;
                } else {
                    ctx.fillStyle = CONFIG.colors.wall;
                    ctx.shadowBlur = 0;
                }
                
                ctx.fill();
                ctx.shadowBlur = 0;
            });

            drawGravityArrow(ctx, width, height);
            requestRef.current = requestAnimationFrame(render);
        };

        // Start
        startLevel();
        render();

        // Cleanup
        return () => {
            window.removeEventListener('keydown', handleInput);
            window.removeEventListener('resize', () => window.location.reload());
            cancelAnimationFrame(requestRef.current);
            Runner.stop(runner);
            Engine.clear(engine);
        };
    }, []);

    return (
        <div id="game-container">
            <canvas ref={canvasRef} />
            <div id="ui-layer">
                <h1>Gravity Maze <span className="subtitle">Nightmare</span></h1>
                <p>LEVEL: <span id="level-display">{level}</span></p>
                <p>DEATHS: <span id="death-display">{deaths}</span></p>
            </div>
            
            <div id="status-message" className={gameStatus !== 'playing' ? 'visible' : ''} style={{
                color: gameStatus === 'clear' ? '#4ecdc4' : '#ff3333',
                opacity: gameStatus !== 'playing' ? 1 : 0
            }}>
                {statusMessage}
            </div>

            <div className="controls-hint">
                <div><span className="key">↑</span> <span className="key">↓</span> <span className="key">←</span> <span className="key">→</span> : 重力操作</div>
                <div><span className="key">R</span> : リトライ</div>
                <div className="danger-text">⚠️ 赤いトゲに触れると即死</div>
                <div className="danger-text">⚠️ 壁に当たると跳ねます</div>
            </div>
        </div>
    );
};

export default GravityMaze;
