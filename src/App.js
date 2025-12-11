import React, { useState, useEffect, useRef } from 'react';
import { Users, Trophy, RotateCcw } from 'lucide-react';

const BasketballGame = () => {
  const canvasRef = useRef(null);
  const [gameState, setGameState] = useState('setup');
  const [isPaused, setIsPaused] = useState(false);
  const [pokiSDKLoaded, setPokiSDKLoaded] = useState(false);
  const [gameMode, setGameMode] = useState('2player');
  const [team1, setTeam1] = useState({ name: 'Team Blue', score: 0, color: '#3b82f6' });
  const [team2, setTeam2] = useState({ name: 'Team Red', score: 0, color: '#ef4444' });
  const [quarter, setQuarter] = useState(1);
  const [timeLeft, setTimeLeft] = useState(120);
  const [eventLog, setEventLog] = useState([]);
  const [crowdNoise, setCrowdNoise] = useState(50);
  const [isMobile, setIsMobile] = useState(false);
  const [touchControls, setTouchControls] = useState({
    p1: { up: false, down: false, left: false, right: false },
    p2: { up: false, down: false, left: false, right: false }
  });
  
  const gameRef = useRef({
    player1: { x: 400, y: 500, radius: 15, speed: 4, team: 1, hasBall: true },
    player2: { x: 400, y: 100, radius: 15, speed: 4, team: 2, hasBall: false },
    ball: { x: 400, y: 500, radius: 8, velocityX: 0, velocityY: 0, holder: 1, hasScored: false, shotBy: 0 },
    aiPlayers: [],
    controlledPlayer1: null,
    controlledPlayer2: null,
    keys: {},
    dribblePhase: 0,
    score: { team1: 0, team2: 0 },
    aiDecisionTimer: 0,
    timeLeft: 120,
    quarter: 1,
    gameInitialized: false,
    isPaused: false
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize Poki SDK
  useEffect(() => {
    if (window.PokiSDK) {
      window.PokiSDK.init().then(() => {
        console.log('Poki SDK initialized successfully');
        setPokiSDKLoaded(true);
        // Show loading screen is done
        window.PokiSDK.gameLoadingFinished();
      }).catch((error) => {
        console.error('Poki SDK initialization error:', error);
      });
    }
  }, []);

  useEffect(() => {
    if (gameState === 'playing') {
      // Initialize quarter and time in ref only once at game start
      if (!gameRef.current.gameInitialized) {
        gameRef.current.quarter = 1;
        gameRef.current.timeLeft = 120;
        gameRef.current.gameInitialized = true;
      }
      initializeGame();
      
      const handleKeyDown = (e) => {
        // Pause with P or Escape key
        if (e.key.toLowerCase() === 'p' || e.key === 'Escape') {
          e.preventDefault();
          gameRef.current.isPaused = !gameRef.current.isPaused;
          setIsPaused(gameRef.current.isPaused);
          // Clear all key states when pausing
          if (gameRef.current.isPaused) {
            gameRef.current.keys = {};
          }
          return;
        }

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter', 'w', 'a', 's', 'd', 'e', 'Shift', 'q', '/'].includes(e.key) ||
            ['w', 'a', 's', 'd', 'e', 'q'].includes(e.key.toLowerCase())) {
          e.preventDefault();
        }

        if (!gameRef.current.isPaused) {
          gameRef.current.keys[e.key.toLowerCase()] = true;
          if (e.key === ' ') shootBall(1);
          if (e.key === 'Enter') shootBall(2);
          if (e.key.toLowerCase() === 'e') stealBall(1);
          if (e.key === 'Shift') stealBall(2);
          if (e.key.toLowerCase() === 'q') passBall(1);
          if (e.key === '/') passBall(2);
        }
      };

      const handleKeyUp = (e) => {
        if (!gameRef.current.isPaused) {
          gameRef.current.keys[e.key.toLowerCase()] = false;
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);

      const gameLoop = setInterval(() => {
        if (!gameRef.current.isPaused) {
          updateGame();
        }
        drawGame();
      }, 1000 / 60);

      const timer = setInterval(() => {
        if (gameRef.current.isPaused) return;

        const currentTime = gameRef.current.timeLeft;

        if (currentTime <= 1) {
          if (gameRef.current.quarter < 4) {
            const currentQuarter = gameRef.current.quarter;
            addEvent(`End of Quarter ${currentQuarter}!`);
            gameRef.current.quarter = currentQuarter + 1;
            gameRef.current.timeLeft = 120;
            setQuarter(currentQuarter + 1);
            setTimeLeft(120);
          } else {
            // Game finished - notify Poki
            if (window.PokiSDK) {
              window.PokiSDK.gameplayStop();
            }
            setGameState('finished');
          }
        } else {
          gameRef.current.timeLeft = currentTime - 1;
          setTimeLeft(currentTime - 1);
        }
      }, 1000);

      return () => {
        clearInterval(gameLoop);
        clearInterval(timer);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      };
    }
  }, [gameState]);

  useEffect(() => {
    if (gameState === 'playing' && isMobile) {
      const keys = gameRef.current.keys;
      keys['w'] = touchControls.p1.up;
      keys['s'] = touchControls.p1.down;
      keys['a'] = touchControls.p1.left;
      keys['d'] = touchControls.p1.right;
      keys['arrowup'] = touchControls.p2.up;
      keys['arrowdown'] = touchControls.p2.down;
      keys['arrowleft'] = touchControls.p2.left;
      keys['arrowright'] = touchControls.p2.right;
    }
  }, [touchControls, gameState, isMobile]);

  const handleTouchButton = (player, direction, isPressed) => {
    setTouchControls(prev => ({
      ...prev,
      [player]: { ...prev[player], [direction]: isPressed }
    }));
  };

  const initializeGame = () => {
    const game = gameRef.current;
    game.aiPlayers = [];
    
    for (let i = 0; i < 4; i++) {
      game.aiPlayers.push({
        x: 100 + i * 150,
        y: 450,
        radius: 15,
        team: 1,
        speed: 2 + Math.random(),
        targetX: 100 + i * 150,
        targetY: 450
      });
    }
    
    for (let i = 0; i < 4; i++) {
      game.aiPlayers.push({
        x: 100 + i * 150,
        y: 150,
        radius: 15,
        team: 2,
        speed: 2 + Math.random(),
        targetX: 100 + i * 150,
        targetY: 150
      });
    }

    const startingTeam = Math.random() < 0.5 ? 1 : 2;
    game.player1.x = 400;
    game.player1.y = 500;
    game.player2.x = 400;
    game.player2.y = 100;
    
    if (startingTeam === 1) {
      game.player1.hasBall = true;
      game.player2.hasBall = false;
      game.ball.x = 400;
      game.ball.y = 500;
      game.ball.holder = 1;
      addEvent(`${team1.name} wins the tip-off!`);
    } else {
      game.player2.hasBall = true;
      game.player1.hasBall = false;
      game.ball.x = 400;
      game.ball.y = 100;
      game.ball.holder = 2;
      addEvent(`${team2.name} wins the tip-off!`);
    }
  };

  const addEvent = (message) => {
    setEventLog(prev => [{ time: Date.now(), message }, ...prev.slice(0, 9)]);
  };

  const updateGame = () => {
    const game = gameRef.current;
    const keys = game.keys;
    const player1 = game.controlledPlayer1 || game.player1;
    const player2 = game.controlledPlayer2 || game.player2;

    let newX1 = player1.x;
    let newY1 = player1.y;
    if (keys['w']) newY1 -= player1.speed;
    if (keys['s']) newY1 += player1.speed;
    if (keys['a']) newX1 -= player1.speed;
    if (keys['d']) newX1 += player1.speed;
    if (newX1 > player1.radius && newX1 < 800 - player1.radius) player1.x = newX1;
    if (newY1 > player1.radius && newY1 < 600 - player1.radius) player1.y = newY1;

    if (gameMode === 'vsComputer') {
      game.aiDecisionTimer++;
      
      if (player2.hasBall && game.ball.holder === 2) {
        const targetY = 590;
        const distToBasket = Math.abs(player2.y - targetY);
        
        // Move toward basket slower and less accurately
        if (player2.y < targetY - 100) player2.y += player2.speed * 0.7; // Slower movement
        
        // Add some randomness to movement - sometimes moves wrong direction
        if (Math.random() < 0.1) {
          player2.x += (Math.random() - 0.5) * player2.speed * 2; // Random sideways movement
        } else {
          if (player2.x < 370) player2.x += player2.speed * 0.6; // Less accurate centering
          else if (player2.x > 430) player2.x -= player2.speed * 0.6;
        }
        
        // Shoot less frequently and from worse positions
        if (distToBasket < 250 && player2.x > 340 && player2.x < 460 && game.aiDecisionTimer % 70 === 0 && Math.random() < 0.6) {
          shootBall(2);
        }
        
        // Pass less frequently
        if (game.aiDecisionTimer % 120 === 0 && Math.random() < 0.2) {
          passBall(2);
        }
      } else {
        if (game.ball.holder === 1) {
          const dx = game.ball.x - player2.x;
          const dy = game.ball.y - player2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          // Chase slower and sometimes in wrong direction
          if (dist > 5) {
            if (Math.random() < 0.15) {
              // Sometimes moves away from the ball
              player2.x -= (dx / dist) * player2.speed * 0.5;
              player2.y -= (dy / dist) * player2.speed * 0.5;
            } else {
              // Slower chase speed
              player2.x += (dx / dist) * player2.speed * 0.6;
              player2.y += (dy / dist) * player2.speed * 0.6;
            }
          }
          
          // Steal less frequently and with worse timing
          if (dist < 50 && game.aiDecisionTimer % 50 === 0 && Math.random() < 0.4) {
            stealBall(2);
          }
        } else if (game.ball.holder === 0) {
          const dx = game.ball.x - player2.x;
          const dy = game.ball.y - player2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          // Chase loose ball slower
          if (dist > 5) {
            player2.x += (dx / dist) * player2.speed * 0.5;
            player2.y += (dy / dist) * player2.speed * 0.5;
          }
        }
      }
      
      player2.x = Math.max(player2.radius, Math.min(800 - player2.radius, player2.x));
      player2.y = Math.max(player2.radius, Math.min(600 - player2.radius, player2.y));
    } else {
      let newX2 = player2.x;
      let newY2 = player2.y;
      if (keys['arrowup']) newY2 -= player2.speed;
      if (keys['arrowdown']) newY2 += player2.speed;
      if (keys['arrowleft']) newX2 -= player2.speed;
      if (keys['arrowright']) newX2 += player2.speed;
      if (newX2 > player2.radius && newX2 < 800 - player2.radius) player2.x = newX2;
      if (newY2 > player2.radius && newY2 < 600 - player2.radius) player2.y = newY2;
    }

    if (game.ball.holder === 1 && player1.hasBall) {
      game.dribblePhase = (game.dribblePhase + 0.15) % (Math.PI * 2);
      const dribbleOffset = Math.sin(game.dribblePhase) * 10;
      game.ball.x = player1.x;
      game.ball.y = player1.y - 20 + dribbleOffset; // Ball in front (toward top basket)
    } else if (game.ball.holder === 2 && player2.hasBall) {
      game.dribblePhase = (game.dribblePhase + 0.15) % (Math.PI * 2);
      const dribbleOffset = Math.sin(game.dribblePhase) * 10;
      game.ball.x = player2.x;
      game.ball.y = player2.y + 20 + dribbleOffset; // Ball in front (toward bottom basket)
    } else if (game.ball.holder === 1 || game.ball.holder === 2) {
      const aiWithBall = game.aiPlayers.find(ai => ai.hasBall);
      if (aiWithBall) {
        game.dribblePhase = (game.dribblePhase + 0.15) % (Math.PI * 2);
        const dribbleOffset = Math.sin(game.dribblePhase) * 10;
        game.ball.x = aiWithBall.x;
        // Ball position based on which team the AI is on
        if (aiWithBall.team === 1) {
          game.ball.y = aiWithBall.y - 20 + dribbleOffset; // Team 1 (blue) - ball in front toward top
        } else {
          game.ball.y = aiWithBall.y + 20 + dribbleOffset; // Team 2 (red) - ball in front toward bottom
        }
      }
    } else if (game.ball.holder === 0) {
      game.ball.x += game.ball.velocityX;
      game.ball.y += game.ball.velocityY;
      game.ball.velocityY += 0.3;
      game.ball.velocityX *= 0.99;

      if (game.ball.y > 590) {
        game.ball.y = 590;
        game.ball.velocityY *= -0.6;
        game.ball.velocityX *= 0.8;
        if (Math.abs(game.ball.velocityY) < 1) game.ball.velocityY = 0;
      }

      const dist1 = Math.sqrt(Math.pow(player1.x - game.ball.x, 2) + Math.pow(player1.y - game.ball.y, 2));
      const dist2 = Math.sqrt(Math.pow(player2.x - game.ball.x, 2) + Math.pow(player2.y - game.ball.y, 2));

      // Allow pickup when ball is slow or stopped bouncing
      const ballIsStopped = game.ball.velocityY === 0 && Math.abs(game.ball.velocityX) < 0.5;
      const ballIsSlow = Math.abs(game.ball.velocityY) < 5 && Math.abs(game.ball.velocityX) < 3;
      const canPickup = ballIsStopped || ballIsSlow;

      if (dist1 < 35 && canPickup) {
        player1.hasBall = true;
        player2.hasBall = false;
        game.ball.holder = 1;
        game.ball.velocityX = 0;
        game.ball.velocityY = 0;
        game.aiPlayers.forEach(ai => ai.hasBall = false);
        addEvent(`${team1.name} Player got the ball!`);
      } else if (dist2 < 35 && canPickup) {
        player2.hasBall = true;
        player1.hasBall = false;
        game.ball.holder = 2;
        game.ball.velocityX = 0;
        game.ball.velocityY = 0;
        game.aiPlayers.forEach(ai => ai.hasBall = false);
        addEvent(`${team2.name} Player got the ball!`);
      } else {
        game.aiPlayers.forEach(ai => {
          const distToAI = Math.sqrt(Math.pow(ai.x - game.ball.x, 2) + Math.pow(ai.y - game.ball.y, 2));
          if (distToAI < 35 && canPickup) {
            ai.hasBall = true;
            game.ball.holder = ai.team;
            player1.hasBall = false;
            player2.hasBall = false;
            
            if (ai.team === 1) game.controlledPlayer1 = ai;
            else game.controlledPlayer2 = ai;
            
            game.aiPlayers.forEach(other => {
              if (other !== ai) other.hasBall = false;
            });
            const teamName = ai.team === 1 ? team1.name : team2.name;
            addEvent(`${teamName} teammate got the ball - now controlling!`);
          }
        });
      }
    }

    checkBasketScoring();
    updateAIPlayers();
  };

  const checkBasketScoring = () => {
    const game = gameRef.current;
    const ball = game.ball;
    if (game.ball.hasScored) return;

    if (ball.x > 370 && ball.x < 430 && ball.y < 30 && ball.velocityY < -5) {
      if (game.ball.shotBy === 1) {
        game.ball.hasScored = true;
        game.score.team1 += 2;
        setTeam1(prev => ({ ...prev, score: prev.score + 2 }));
        addEvent(`${team1.name} SCORES! 🏀 +2 points!`);
        setCrowdNoise(Math.min(100, crowdNoise + 15));
        resetBallToCenter(2);
      }
    }

    if (ball.x > 370 && ball.x < 430 && ball.y > 570 && ball.velocityY > 5) {
      if (game.ball.shotBy === 2) {
        game.ball.hasScored = true;
        game.score.team2 += 2;
        setTeam2(prev => ({ ...prev, score: prev.score + 2 }));
        addEvent(`${team2.name} SCORES! 🏀 +2 points!`);
        setCrowdNoise(Math.min(100, crowdNoise + 15));
        resetBallToCenter(1);
      }
    }
  };

  const resetBallToCenter = (teamWithBall) => {
    const game = gameRef.current;
    setTimeout(() => {
      game.controlledPlayer1 = null;
      game.controlledPlayer2 = null;
      game.player1.x = 400;
      game.player1.y = 500;
      game.player2.x = 400;
      game.player2.y = 100;
      
      if (teamWithBall === 1) {
        game.player1.hasBall = true;
        game.player2.hasBall = false;
        game.ball.x = 400;
        game.ball.y = 500;
        game.ball.holder = 1;
      } else {
        game.player2.hasBall = true;
        game.player1.hasBall = false;
        game.ball.x = 400;
        game.ball.y = 100;
        game.ball.holder = 2;
      }
      
      game.ball.velocityX = 0;
      game.ball.velocityY = 0;
      game.ball.hasScored = false;
      game.ball.shotBy = 0;
      game.aiPlayers.forEach(ai => ai.hasBall = false);
    }, 1500);
  };

  const updateAIPlayers = () => {
    const game = gameRef.current;
    const allAIPlayers = [...game.aiPlayers];
    if (game.controlledPlayer1) allAIPlayers.push(game.player1);
    if (game.controlledPlayer2) allAIPlayers.push(game.player2);
    
    allAIPlayers.forEach((ai) => {
      if (ai === game.controlledPlayer1 || ai === game.controlledPlayer2) return;
      
      if (game.ball.holder === 0 && Math.abs(game.ball.velocityY) < 2) {
        const distToBall = Math.sqrt(
          Math.pow(ai.x - game.ball.x, 2) + Math.pow(ai.y - game.ball.y, 2)
        );
        if (distToBall < 200) {
          ai.targetX = game.ball.x;
          ai.targetY = game.ball.y;
        }
      } else {
        const player1 = game.controlledPlayer1 || game.player1;
        const player2 = game.controlledPlayer2 || game.player2;
        let ballCarrier;
        let hasBall = false;
        
        if (ai.team === 1 && game.ball.holder === 1) {
          ballCarrier = player1.hasBall ? player1 : allAIPlayers.find(p => p.hasBall && p.team === 1);
          hasBall = true;
        } else if (ai.team === 2 && game.ball.holder === 2) {
          ballCarrier = player2.hasBall ? player2 : allAIPlayers.find(p => p.hasBall && p.team === 2);
          hasBall = true;
        }
        
        const teamAI = allAIPlayers.filter(p => p.team === ai.team);
        const teamIndex = teamAI.indexOf(ai);
        
        if (hasBall && ballCarrier && !ai.hasBall) {
          const ballY = ballCarrier.y;
          const ballX = ballCarrier.x;
          const attackingUp = ai.team === 1;
          
          if (teamIndex === 0) {
            ai.targetX = Math.max(100, ballX - 180);
            ai.targetY = attackingUp ? Math.max(100, ballY - 80) : Math.min(500, ballY + 80);
          } else if (teamIndex === 1) {
            ai.targetX = Math.min(700, ballX + 180);
            ai.targetY = attackingUp ? Math.max(100, ballY - 80) : Math.min(500, ballY + 80);
          } else if (teamIndex === 2) {
            ai.targetX = ballX + (Math.random() - 0.5) * 100;
            ai.targetY = attackingUp ? Math.max(50, ballY - 120) : Math.min(550, ballY + 120);
          } else if (teamIndex === 3) {
            ai.targetX = ballX + (Math.random() - 0.5) * 80;
            ai.targetY = attackingUp ? Math.min(550, ballY + 100) : Math.max(50, ballY - 100);
          } else {
            ai.targetX = ballX + (teamIndex % 2 === 0 ? -150 : 150);
            ai.targetY = attackingUp ? Math.max(50, ballY - 60) : Math.min(550, ballY + 60);
          }
          
          ai.targetX = Math.max(50, Math.min(750, ai.targetX));
          ai.targetY = Math.max(50, Math.min(550, ai.targetY));
        } else {
          if (Math.random() < 0.03) {
            const positions = [150, 350, 450, 650, 250, 550];
            ai.targetX = positions[teamIndex % positions.length];
            ai.targetY = (ai.team === 1 ? 400 : 200) + (Math.random() - 0.5) * 100;
          }
        }
      }

      const dx = ai.targetX - ai.x;
      const dy = ai.targetY - ai.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 5) {
        ai.x += (dx / dist) * ai.speed;
        ai.y += (dy / dist) * ai.speed;
      }
    });
  };

  const shootBall = (playerNum) => {
    const game = gameRef.current;
    const player = playerNum === 1 ? (game.controlledPlayer1 || game.player1) : (game.controlledPlayer2 || game.player2);
    if (player.hasBall && game.ball.holder === playerNum) {
      player.hasBall = false;
      game.ball.holder = 0;
      game.ball.hasScored = false;
      game.ball.shotBy = playerNum;
      const shootUp = playerNum === 1;
      const angle = shootUp ? -Math.PI / 2 : Math.PI / 2;
      const power = 15;
      game.ball.velocityX = Math.cos(angle) * power * 0.3;
      game.ball.velocityY = Math.sin(angle) * power;
      const teamName = playerNum === 1 ? team1.name : team2.name;
      addEvent(`${teamName} Player shoots!`);
    }
  };

  const stealBall = (playerNum) => {
    const game = gameRef.current;
    const stealer = playerNum === 1 ? game.player1 : game.player2;
    const opponent = playerNum === 1 ? game.player2 : game.player1;
    const dist = Math.sqrt(Math.pow(stealer.x - opponent.x, 2) + Math.pow(stealer.y - opponent.y, 2));
    
    if (dist < 40 && opponent.hasBall && game.ball.holder !== playerNum) {
      if (Math.random() < 0.4) {
        opponent.hasBall = false;
        stealer.hasBall = true;
        game.ball.holder = playerNum;
        const teamName = playerNum === 1 ? team1.name : team2.name;
        addEvent(`${teamName} STEALS the ball! 🔥`);
        setCrowdNoise(Math.min(100, crowdNoise + 10));
      } else {
        const teamName = playerNum === 1 ? team1.name : team2.name;
        addEvent(`${teamName} steal attempt failed!`);
      }
    }
  };

  const passBall = (playerNum) => {
    const game = gameRef.current;
    const passer = playerNum === 1 ? (game.controlledPlayer1 || game.player1) : (game.controlledPlayer2 || game.player2);
    if (!passer.hasBall || game.ball.holder !== playerNum) return;
    
    const targetBasketY = playerNum === 1 ? 10 : 590;
    const allTeammates = game.aiPlayers.filter(ai => 
      ai.team === playerNum && ai !== game.controlledPlayer1 && ai !== game.controlledPlayer2
    );
    
    if (playerNum === 1 && !game.controlledPlayer1) allTeammates.push(game.player1);
    else if (playerNum === 2 && !game.controlledPlayer2) allTeammates.push(game.player2);
    if (allTeammates.length === 0) return;
    
    let closestToBasket = allTeammates[0];
    let minDistToBasket = Math.abs(closestToBasket.y - targetBasketY);
    allTeammates.forEach(teammate => {
      const distToBasket = Math.abs(teammate.y - targetBasketY);
      if (distToBasket < minDistToBasket) {
        minDistToBasket = distToBasket;
        closestToBasket = teammate;
      }
    });
    
    passer.hasBall = false;
    closestToBasket.hasBall = true;
    game.ball.holder = playerNum;
    game.ball.x = closestToBasket.x;
    game.ball.y = closestToBasket.y;
    game.ball.velocityX = 0;
    game.ball.velocityY = 0;
    
    if (playerNum === 1) game.controlledPlayer1 = closestToBasket;
    else game.controlledPlayer2 = closestToBasket;
    
    const teamName = playerNum === 1 ? team1.name : team2.name;
    addEvent(`${teamName} passes to player near basket! 🏀`);
  };

  const drawGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const game = gameRef.current;

    ctx.fillStyle = '#d97706';
    ctx.fillRect(0, 0, 800, 600);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 780, 580);
    ctx.beginPath();
    ctx.moveTo(10, 300);
    ctx.lineTo(790, 300);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(400, 300, 50, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(380, 5, 40, 10);
    ctx.fillRect(380, 585, 40, 10);
    ctx.beginPath();
    ctx.arc(400, 10, 120, 0, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(400, 590, 120, Math.PI, Math.PI * 2);
    ctx.stroke();

    // Draw scores above baskets
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#3b82f6'; // Blue for team 1
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeText(game.score.team1, 400, 60);
    ctx.fillText(game.score.team1, 400, 60);

    ctx.fillStyle = '#ef4444'; // Red for team 2
    ctx.strokeText(game.score.team2, 400, 555);
    ctx.fillText(game.score.team2, 400, 555);

    // Draw quarter and time remaining above red team basket
    const mins = Math.floor(game.timeLeft / 60);
    const secs = game.timeLeft % 60;
    const timeDisplay = `Q${game.quarter} ${mins}:${secs.toString().padStart(2, '0')}`;
    ctx.font = 'bold 32px Arial';
    ctx.fillStyle = '#fbbf24'; // Yellow
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeText(timeDisplay, 650, 555);
    ctx.fillText(timeDisplay, 650, 555);

    // Helper function to draw a player facing a direction
    const drawPlayer = (x, y, radius, color, facingUp, isControlled, label) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      
      if (isControlled) {
        ctx.strokeStyle = label === 'P1' ? '#ffff00' : '#00ff00';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      // Draw direction indicator (arrow showing which way they're facing)
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      if (facingUp) {
        // Triangle pointing up
        ctx.moveTo(x, y - radius + 5);
        ctx.lineTo(x - 5, y - radius + 12);
        ctx.lineTo(x + 5, y - radius + 12);
      } else {
        // Triangle pointing down
        ctx.moveTo(x, y + radius - 5);
        ctx.lineTo(x - 5, y + radius - 12);
        ctx.lineTo(x + 5, y + radius - 12);
      }
      ctx.closePath();
      ctx.fill();
      
      // Draw label
      if (isControlled) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y - 20);
      }
    };

    // Draw AI players with direction indicators
    game.aiPlayers.forEach(ai => {
      const facingUp = ai.team === 1; // Team 1 (blue) faces up, Team 2 (red) faces down
      const isControlled = (ai === game.controlledPlayer1) || (ai === game.controlledPlayer2);
      const label = ai === game.controlledPlayer1 ? 'P1' : ai === game.controlledPlayer2 ? 'P2' : '';
      drawPlayer(ai.x, ai.y, ai.radius, ai.team === 1 ? team1.color : team2.color, facingUp, isControlled, label);
    });

    // Draw Player 1 (Blue - faces UP toward top basket)
    const p1IsControlled = !game.controlledPlayer1;
    drawPlayer(game.player1.x, game.player1.y, game.player1.radius, team1.color, true, p1IsControlled, p1IsControlled ? 'P1' : '');

    // Draw Player 2 (Red - faces DOWN toward bottom basket)
    const p2IsControlled = !game.controlledPlayer2;
    drawPlayer(game.player2.x, game.player2.y, game.player2.radius, team2.color, false, p2IsControlled, p2IsControlled ? 'P2' : '');

    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    ctx.arc(game.ball.x, game.ball.y, game.ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(game.ball.x, game.ball.y, game.ball.radius * 0.7, 0, Math.PI * 2);
    ctx.stroke();
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startGame = () => {
    if (team1.name && (gameMode === 'vsComputer' || team2.name)) {
      // Notify Poki that gameplay is starting
      if (window.PokiSDK) {
        window.PokiSDK.gameplayStart();
      }

      setGameState('playing');
      if (gameMode === 'vsComputer') {
        setTeam2({ ...team2, name: 'Computer' });
        addEvent('Game starts! Player vs Computer!');
      } else {
        addEvent('Game starts! Two players ready!');
      }
    }
  };

  const resetGame = () => {
    // Notify Poki that gameplay is stopping
    if (window.PokiSDK) {
      window.PokiSDK.gameplayStop();
    }

    setGameState('setup');
    setTeam1(prev => ({ ...prev, score: 0 }));
    setTeam2(prev => ({ ...prev, score: 0, name: 'Team Red' }));
    setQuarter(1);
    setTimeLeft(120);
    setEventLog([]);
    setCrowdNoise(50);
    setGameMode('2player');
    gameRef.current.score = { team1: 0, team2: 0 };
    gameRef.current.aiDecisionTimer = 0;
    gameRef.current.gameInitialized = false;
    gameRef.current.quarter = 1;
    gameRef.current.timeLeft = 120;
  };

  const TouchButton = ({ direction, player, label }) => {
    return (
      <button
        onTouchStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleTouchButton(player, direction, true);
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleTouchButton(player, direction, false);
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          handleTouchButton(player, direction, true);
        }}
        onMouseUp={(e) => {
          e.preventDefault();
          handleTouchButton(player, direction, false);
        }}
        onMouseLeave={(e) => {
          handleTouchButton(player, direction, false);
        }}
        className="bg-white/20 active:bg-white/40 rounded-lg p-4 touch-none select-none font-bold text-lg"
      >
        <span className="text-white">{label}</span>
      </button>
    );
  };

  if (gameState === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-900 via-purple-900 to-blue-900 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto pb-8">
          <div className="text-center mb-6">
            <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-400 to-red-500 mb-2 drop-shadow-lg">🏀 Basketball Game 🏀</h1>
            <p className="text-yellow-300 text-xl font-semibold">Choose Your Game Mode!</p>
            {isMobile && (
              <p className="text-yellow-300 text-sm mt-2">📱 Mobile-Optimized with Touch Controls</p>
            )}
          </div>

          <button
            onClick={startGame}
            disabled={!team1.name || (gameMode === '2player' && !team2.name)}
            className="w-full mb-6 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 text-white py-5 rounded-xl text-2xl font-bold hover:from-green-600 hover:via-emerald-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105 shadow-2xl border-2 border-green-300"
          >
            🚀 {gameMode === 'vsComputer' ? 'Start Game vs Computer' : 'Start 2-Player Game'}
          </button>

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => setGameMode('2player')}
              className={`p-6 rounded-xl border-4 transition-all transform hover:scale-105 shadow-lg ${
                gameMode === '2player'
                  ? 'border-yellow-400 bg-gradient-to-br from-yellow-500/30 to-orange-500/30 scale-105 shadow-yellow-500/50'
                  : 'border-blue-400/40 bg-gradient-to-br from-blue-900/30 to-purple-900/30 hover:from-blue-900/50 hover:to-purple-900/50'
              }`}
            >
              <div className="text-5xl mb-2">👥</div>
              <h3 className="text-2xl font-bold text-yellow-300 mb-2">2 Players</h3>
              <p className="text-gray-200 text-sm font-medium">Play against a friend locally</p>
            </button>

            <button
              onClick={() => setGameMode('vsComputer')}
              className={`p-6 rounded-xl border-4 transition-all transform hover:scale-105 shadow-lg ${
                gameMode === 'vsComputer'
                  ? 'border-yellow-400 bg-gradient-to-br from-yellow-500/30 to-orange-500/30 scale-105 shadow-yellow-500/50'
                  : 'border-green-400/40 bg-gradient-to-br from-green-900/30 to-teal-900/30 hover:from-green-900/50 hover:to-teal-900/50'
              }`}
            >
              <div className="text-5xl mb-2">🤖</div>
              <h3 className="text-2xl font-bold text-yellow-300 mb-2">VS Computer</h3>
              <p className="text-gray-200 text-sm font-medium">Challenge the AI opponent</p>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-blue-900/50 to-blue-950/50 backdrop-blur-sm rounded-xl p-4 border-3 border-blue-400 shadow-xl shadow-blue-500/30">
              <h2 className="text-xl font-bold text-yellow-300 mb-3 bg-blue-800/40 rounded-lg px-2 py-1">🔵 Player 1</h2>
              <input
                type="text"
                value={team1.name}
                onChange={(e) => setTeam1({ ...team1, name: e.target.value })}
                className="w-full p-2 rounded bg-white/20 text-white border-2 border-blue-400 mb-3 text-sm"
                placeholder="Enter Team Name"
              />
              <div className="bg-blue-900/50 p-3 rounded mb-2">
                <p className="text-white font-bold mb-2 text-sm">🎮 Controls:</p>
                {!isMobile ? (
                  <div className="text-gray-200 text-xs space-y-0.5">
                    <div>• <strong>W/S/A/D</strong> - Move</div>
                    <div>• <strong>SPACE</strong> - Shoot</div>
                    <div>• <strong>E</strong> - Steal</div>
                    <div>• <strong>Q</strong> - Pass</div>
                  </div>
                ) : (
                  <div className="text-gray-200 text-xs">
                    <div>• Touch controls on left</div>
                    <div>• Action buttons below</div>
                  </div>
                )}
              </div>
              <p className="text-yellow-300 text-xs">⬆️ Score at TOP basket</p>
            </div>

            <div className="bg-gradient-to-br from-red-900/50 to-red-950/50 backdrop-blur-sm rounded-xl p-4 border-3 border-red-400 shadow-xl shadow-red-500/30">
              <h2 className="text-xl font-bold text-yellow-300 mb-3 bg-red-800/40 rounded-lg px-2 py-1">
                {gameMode === 'vsComputer' ? '🤖 Computer' : '🔴 Player 2'}
              </h2>
              {gameMode === '2player' ? (
                <>
                  <input
                    type="text"
                    value={team2.name}
                    onChange={(e) => setTeam2({ ...team2, name: e.target.value })}
                    className="w-full p-2 rounded bg-white/20 text-white border-2 border-red-400 mb-3 text-sm"
                    placeholder="Enter Team Name"
                  />
                  <div className="bg-red-900/50 p-3 rounded mb-2">
                    <p className="text-white font-bold mb-2 text-sm">🎮 Controls:</p>
                    {!isMobile ? (
                      <div className="text-gray-200 text-xs space-y-0.5">
                        <div>• <strong>Arrow Keys</strong> - Move</div>
                        <div>• <strong>ENTER</strong> - Shoot</div>
                        <div>• <strong>SHIFT</strong> - Steal</div>
                        <div>• <strong>/</strong> - Pass</div>
                      </div>
                    ) : (
                      <div className="text-gray-200 text-xs">
                        <div>• Touch controls on right</div>
                        <div>• Action buttons below</div>
                      </div>
                    )}
                  </div>
                  <p className="text-yellow-300 text-xs">⬇️ Score at BOTTOM basket</p>
                </>
              ) : (
                <div className="bg-red-900/50 p-3 rounded h-full flex flex-col justify-center">
                  <div className="text-center">
                    <div className="text-4xl mb-2">🤖</div>
                    <p className="text-white text-sm font-bold mb-1">AI Opponent</p>
                    <p className="text-gray-300 text-xs mb-2">Computer controls Red</p>
                    <div className="text-gray-200 text-xs">
                      <div>• AI controlled automatically</div>
                      <div>• No manual controls needed</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 bg-gradient-to-br from-purple-900/50 to-indigo-900/50 backdrop-blur-sm rounded-xl p-6 border-2 border-purple-400 shadow-xl">
            <h3 className="text-2xl font-bold text-yellow-300 mb-4 bg-purple-800/40 rounded-lg px-3 py-2">📋 Game Info</h3>
            <div className="grid md:grid-cols-2 gap-3 text-gray-100 text-sm font-medium">
              <div className="flex items-center gap-2">✨ Each team: 1 player + 4 AI teammates</div>
              <div className="flex items-center gap-2">⏱️ 4 Quarters (2 minutes each)</div>
              <div className="flex items-center gap-2">🏀 Dribble the ball as you move</div>
              <div className="flex items-center gap-2">🎯 Get close to opponent basket to score</div>
              <div className="flex items-center gap-2">⚖️ Full NBA rules with referees</div>
              <div className="flex items-center gap-2">🏟️ Stadium audience cheering!</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-orange-900 via-purple-900 to-blue-900 overflow-auto">
      <div className="min-h-full flex flex-col p-2">
        <div className="bg-gradient-to-r from-yellow-600 via-orange-500 to-red-600 text-white text-center py-3 rounded-t-lg font-bold text-lg shadow-lg">
          🏟️ ARENA STADIUM - LIVE AUDIENCE 🏟️
        </div>

        <div className="bg-gradient-to-br from-gray-900 to-black text-white p-3 rounded-b-lg shadow-lg border-2 border-yellow-500">
          <div className="flex justify-between items-center gap-3">
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-br from-blue-600 to-blue-800 px-4 py-2 rounded-lg shadow-lg border-2 border-blue-400">
                <div className="font-bold text-sm text-yellow-300">{team1.name}</div>
                <div className="text-5xl font-bold text-white">{team1.score}</div>
              </div>
              <div className="text-4xl font-bold text-white">-</div>
              <div className="bg-gradient-to-br from-red-600 to-red-800 px-4 py-2 rounded-lg shadow-lg border-2 border-red-400">
                <div className="font-bold text-sm text-yellow-300">{team2.name}</div>
                <div className="text-5xl font-bold text-white">{team2.score}</div>
              </div>
            </div>

            <div className="text-center bg-gradient-to-br from-purple-800 to-purple-950 rounded-lg px-4 py-2 border-2 border-purple-500 shadow-lg">
              <div className="text-lg font-bold text-yellow-400">Q{quarter}</div>
              <div className="text-3xl font-bold text-white">{formatTime(timeLeft)}</div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  gameRef.current.isPaused = !gameRef.current.isPaused;
                  setIsPaused(gameRef.current.isPaused);
                  if (gameRef.current.isPaused) {
                    gameRef.current.keys = {};
                  }
                }}
                className="bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 px-4 py-2 rounded-lg text-sm font-bold shadow-md"
              >
                {isPaused ? '▶️ Resume' : '⏸️ Pause'}
              </button>
              <button onClick={resetGame} className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 px-4 py-2 rounded-lg text-sm font-bold shadow-md">
                <RotateCcw size={14} className="inline" /> Reset
              </button>
              <button
                onClick={() => {
                  // Notify Poki that gameplay is stopping
                  if (window.PokiSDK) {
                    window.PokiSDK.gameplayStop();
                  }

                  setGameState('setup');
                  setTeam1(prev => ({ ...prev, score: 0 }));
                  setTeam2(prev => ({ ...prev, score: 0, name: 'Team Red' }));
                  setQuarter(1);
                  setTimeLeft(120);
                  setEventLog([]);
                  setCrowdNoise(50);
                  setGameMode('2player');
                  gameRef.current.score = { team1: 0, team2: 0 };
                  gameRef.current.aiDecisionTimer = 0;
                }}
                className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 px-4 py-2 rounded-lg text-sm font-bold shadow-md"
              >
                Quit
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex gap-2 mt-2 min-h-0">
          {isMobile && (
            <div className="flex flex-col justify-center gap-2 p-2 bg-gradient-to-br from-blue-900/40 to-blue-950/40 rounded-lg border-2 border-blue-500/50">
              <div className="text-yellow-300 text-xs text-center font-bold mb-1 bg-blue-800/50 rounded px-2 py-1">P1</div>
              <div className="grid grid-cols-3 gap-1">
                <div></div>
                <TouchButton direction="up" player="p1" label="↑" />
                <div></div>
                <TouchButton direction="left" player="p1" label="←" />
                <div className="bg-gradient-to-br from-blue-600/50 to-blue-800/50 rounded-lg border border-blue-400/30"></div>
                <TouchButton direction="right" player="p1" label="→" />
                <div></div>
                <TouchButton direction="down" player="p1" label="↓" />
                <div></div>
              </div>
              <button
                onClick={() => shootBall(1)}
                className="bg-gradient-to-r from-green-600 to-green-700 active:from-green-700 active:to-green-800 text-white font-bold py-2 px-3 rounded-lg text-xs shadow-lg border border-green-400"
              >
                🏀 SHOOT
              </button>
              <button
                onClick={() => stealBall(1)}
                className="bg-gradient-to-r from-red-600 to-red-700 active:from-red-700 active:to-red-800 text-white font-bold py-2 px-3 rounded-lg text-xs shadow-lg border border-red-400"
              >
                🔥 STEAL
              </button>
              <button
                onClick={() => passBall(1)}
                className="bg-gradient-to-r from-yellow-600 to-yellow-700 active:from-yellow-700 active:to-yellow-800 text-white font-bold py-2 px-3 rounded-lg text-xs shadow-lg border border-yellow-400"
              >
                ⚡ PASS
              </button>
            </div>
          )}

          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-black/40 via-purple-900/20 to-black/40 rounded-lg p-2 border-2 border-purple-500/30 shadow-2xl">
              <canvas
                ref={canvasRef}
                width={800}
                height={600}
                className="border-4 border-yellow-500 rounded-lg max-w-full max-h-full shadow-2xl"
                style={{ width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '100%' }}
              />
            </div>
            {!isMobile && (
              <div className="bg-gradient-to-r from-purple-900/80 to-blue-900/80 text-white p-3 rounded-lg mt-2 border-2 border-purple-500/50 shadow-lg">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><strong className="text-yellow-300">Player 1 (P1):</strong> <span className="text-yellow-400">Yellow outline</span> | Press <kbd className="bg-yellow-600 px-1 rounded">E</kbd> to steal</div>
                  <div><strong className="text-green-300">Player 2 (P2):</strong> <span className="text-green-400">Green outline</span> | Press <kbd className="bg-green-600 px-1 rounded">SHIFT</kbd> to steal</div>
                </div>
                <div className="text-center mt-1 text-xs text-yellow-200 font-semibold">⚡ Get close to opponent to steal the ball! ⚡</div>
              </div>
            )}
          </div>

          {isMobile && gameMode === '2player' && (
            <div className="flex flex-col justify-center gap-2 p-2 bg-gradient-to-br from-red-900/40 to-red-950/40 rounded-lg border-2 border-red-500/50">
              <div className="text-yellow-300 text-xs text-center font-bold mb-1 bg-red-800/50 rounded px-2 py-1">P2</div>
              <div className="grid grid-cols-3 gap-1">
                <div></div>
                <TouchButton direction="up" player="p2" label="↑" />
                <div></div>
                <TouchButton direction="left" player="p2" label="←" />
                <div className="bg-gradient-to-br from-red-600/50 to-red-800/50 rounded-lg border border-red-400/30"></div>
                <TouchButton direction="right" player="p2" label="→" />
                <div></div>
                <TouchButton direction="down" player="p2" label="↓" />
                <div></div>
              </div>
              <button
                onClick={() => shootBall(2)}
                className="bg-gradient-to-r from-green-600 to-green-700 active:from-green-700 active:to-green-800 text-white font-bold py-2 px-3 rounded-lg text-xs shadow-lg border border-green-400"
              >
                🏀 SHOOT
              </button>
              <button
                onClick={() => stealBall(2)}
                className="bg-gradient-to-r from-red-600 to-red-700 active:from-red-700 active:to-red-800 text-white font-bold py-2 px-3 rounded-lg text-xs shadow-lg border border-red-400"
              >
                🔥 STEAL
              </button>
              <button
                onClick={() => passBall(2)}
                className="bg-gradient-to-r from-yellow-600 to-yellow-700 active:from-yellow-700 active:to-yellow-800 text-white font-bold py-2 px-3 rounded-lg text-xs shadow-lg border border-yellow-400"
              >
                ⚡ PASS
              </button>
            </div>
          )}

          {!isMobile && (
            <div className="w-48 flex flex-col gap-2 min-h-0">
              <div className="bg-gradient-to-br from-purple-900 to-purple-950 text-white p-3 rounded-lg shadow-lg border-2 border-purple-500">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={18} className="text-yellow-400" />
                  <span className="font-bold text-sm text-yellow-300">Crowd: {crowdNoise}%</span>
                </div>
                <div className="bg-purple-950 rounded-full h-3 overflow-hidden border border-purple-600 shadow-inner">
                  <div
                    className="bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 h-full transition-all shadow-lg"
                    style={{ width: `${crowdNoise}%` }}
                  ></div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-gray-900 to-black rounded-lg p-3 flex-1 min-h-0 flex flex-col shadow-lg border-2 border-green-500/50">
                <h3 className="text-yellow-400 font-bold mb-2 text-sm bg-green-900/30 px-2 py-1 rounded">📢 Commentary</h3>
                <div className="space-y-1 overflow-y-auto flex-1">
                  {eventLog.map((event) => (
                    <div key={event.time} className="text-gray-100 text-xs bg-gradient-to-r from-black/50 to-gray-800/50 p-2 rounded border-l-2 border-yellow-500 shadow">
                      {event.message}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {isPaused && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-gradient-to-br from-purple-600 via-blue-600 to-purple-700 text-white p-8 rounded-2xl text-center max-w-md shadow-2xl border-4 border-yellow-400">
              <div className="text-6xl mb-4">⏸️</div>
              <h2 className="text-5xl font-bold mb-4 drop-shadow-lg">PAUSED</h2>
              <p className="text-xl mb-6">Press <kbd className="bg-yellow-500 text-black px-3 py-1 rounded font-bold">P</kbd> or <kbd className="bg-yellow-500 text-black px-3 py-1 rounded font-bold">ESC</kbd> to resume</p>
              <button
                onClick={() => setIsPaused(false)}
                className="bg-gradient-to-r from-green-500 to-green-600 text-white px-8 py-4 rounded-xl text-xl font-bold hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-105 shadow-xl border-2 border-green-300"
              >
                ▶️ Resume Game
              </button>
            </div>
          </div>
        )}

        {gameState === 'finished' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm">
            <div className="bg-gradient-to-br from-yellow-500 via-orange-500 to-red-600 text-white p-8 rounded-2xl text-center max-w-md shadow-2xl border-4 border-yellow-400">
              <Trophy size={64} className="mx-auto mb-4 text-yellow-300 drop-shadow-lg" />
              <h2 className="text-5xl font-bold mb-2 drop-shadow-lg">🎉 Game Over! 🎉</h2>
              <div className="text-3xl mt-3 font-extrabold bg-white/20 rounded-lg py-2 px-4 mb-2">
                {team1.score > team2.score ? `🏆 ${team1.name} Wins! 🏆` :
                 team2.score > team1.score ? `🏆 ${team2.name} Wins! 🏆` : "🤝 It's a Tie! 🤝"}
              </div>
              <div className="text-2xl mb-6 font-bold bg-black/30 rounded-lg py-2">Final Score: {team1.score} - {team2.score}</div>
              <button
                onClick={resetGame}
                className="bg-gradient-to-r from-green-500 to-green-600 text-white px-8 py-4 rounded-xl text-xl font-bold hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-105 shadow-xl border-2 border-green-300"
              >
                🔄 Play Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BasketballGame;
