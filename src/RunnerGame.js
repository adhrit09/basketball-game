import { useState, useEffect, useRef } from 'react';

export default function RunnerGame() {
  const [playerY, setPlayerY] = useState(250);
  const [isJumping, setIsJumping] = useState(false);
  const [obstacles, setObstacles] = useState([]);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const velocityRef = useRef(0);
  const gameLoopRef = useRef(null);

  const GROUND = 250;
  const GRAVITY = 0.6;
  const JUMP_FORCE = -12;
  const PLAYER_SIZE = 40;
  const OBSTACLE_WIDTH = 30;
  const OBSTACLE_HEIGHT = 50;

  const handleJump = () => {
    if (!isJumping && gameStarted && !gameOver) {
      velocityRef.current = JUMP_FORCE;
      setIsJumping(true);
    }
  };

  useEffect(() => {
    if (!gameStarted || gameOver) return;

    const handleKeyPress = (e) => {
      if (e.code === 'Space') {
        handleJump();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isJumping, gameStarted, gameOver]);

  useEffect(() => {
    if (!gameStarted || gameOver) return;

    gameLoopRef.current = setInterval(() => {
      // Update player position
      setPlayerY(prev => {
        velocityRef.current += GRAVITY;
        const newY = prev + velocityRef.current;

        if (newY >= GROUND) {
          velocityRef.current = 0;
          setIsJumping(false);
          return GROUND;
        }
        return newY;
      });

      // Update obstacles
      setObstacles(prev => {
        const updated = prev.map(obs => ({
          ...obs,
          x: obs.x - 5
        })).filter(obs => obs.x > -OBSTACLE_WIDTH);

        // Add new obstacle
        if (updated.length === 0 || updated[updated.length - 1].x < 400) {
          if (Math.random() < 0.02) {
            updated.push({ x: 600, y: GROUND });
          }
        }

        return updated;
      });

      // Check collisions
      setObstacles(prev => {
        for (let obs of prev) {
          if (
            obs.x < 100 + PLAYER_SIZE &&
            obs.x + OBSTACLE_WIDTH > 100 &&
            playerY + PLAYER_SIZE > obs.y - OBSTACLE_HEIGHT
          ) {
            setGameOver(true);
          }
        }
        return prev;
      });

      // Update score
      setScore(prev => prev + 1);
    }, 1000 / 60);

    return () => clearInterval(gameLoopRef.current);
  }, [gameStarted, gameOver, playerY]);

  const startGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setObstacles([]);
    setPlayerY(GROUND);
    velocityRef.current = 0;
    setIsJumping(false);
  };

  const resetGame = () => {
    setGameStarted(false);
    setGameOver(false);
    setScore(0);
    setObstacles([]);
    setPlayerY(GROUND);
    velocityRef.current = 0;
    setIsJumping(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-sky-300 to-sky-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">Runner Game</h1>

        <div className="relative bg-white border-4 border-gray-800 rounded-lg overflow-hidden"
             style={{ width: '600px', height: '400px' }}
             onClick={handleJump}
             onTouchStart={(e) => {
               e.preventDefault();
               handleJump();
             }}>
          {!gameStarted && !gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-50 z-10">
              <button
                onClick={startGame}
                className="px-8 py-4 bg-green-500 text-white text-2xl font-bold rounded-lg hover:bg-green-600 transition"
              >
                Start Game
              </button>
              <p className="text-white mt-4 text-lg">Press SPACE or TAP to jump</p>
            </div>
          )}

          {gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-50 z-10">
              <h2 className="text-4xl font-bold text-white mb-2">Game Over!</h2>
              <p className="text-2xl text-white mb-4">Score: {Math.floor(score / 10)}</p>
              <button
                onClick={resetGame}
                className="px-8 py-4 bg-blue-500 text-white text-xl font-bold rounded-lg hover:bg-blue-600 transition"
              >
                Play Again
              </button>
            </div>
          )}

          {/* Ground */}
          <div className="absolute bottom-0 w-full h-20 bg-green-600"></div>

          {/* Ground line */}
          <div className="absolute bottom-20 w-full h-1 bg-green-800"></div>

          {/* Player */}
          <div
            className="absolute bg-blue-500 rounded transition-none"
            style={{
              left: '100px',
              top: `${playerY}px`,
              width: `${PLAYER_SIZE}px`,
              height: `${PLAYER_SIZE}px`
            }}
          >
            <div className="absolute top-2 left-2 w-2 h-2 bg-white rounded-full"></div>
            <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full"></div>
          </div>

          {/* Obstacles */}
          {obstacles.map((obs, i) => (
            <div
              key={i}
              className="absolute bg-red-600 rounded"
              style={{
                left: `${obs.x}px`,
                top: `${obs.y - OBSTACLE_HEIGHT}px`,
                width: `${OBSTACLE_WIDTH}px`,
                height: `${OBSTACLE_HEIGHT}px`
              }}
            ></div>
          ))}

          {/* Score */}
          {gameStarted && (
            <div className="absolute top-4 right-4 text-2xl font-bold text-gray-800">
              Score: {Math.floor(score / 10)}
            </div>
          )}
        </div>

        <div className="mt-4 text-gray-700">
          <p className="text-lg font-semibold">Controls: Press SPACE or TAP/CLICK to jump over obstacles!</p>
        </div>
      </div>
    </div>
  );
}
