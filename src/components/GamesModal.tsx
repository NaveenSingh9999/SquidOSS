import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Gamepad2, Play, Trophy, Star } from '@/lib/icon-map';
import { cn } from '@/lib/utils';

interface GamesModalProps {
  open: boolean;
  onClose: () => void;
}

// Simple game components
const TicTacToe = () => {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true);
  const [winner, setWinner] = useState<string | null>(null);

  const calculateWinner = (squares: string[]) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    
    for (let [a, b, c] of lines) {
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return squares[a];
      }
    }
    return null;
  };

  const handleClick = (index: number) => {
    if (board[index] || winner) return;
    
    const newBoard = board.slice();
    newBoard[index] = isXNext ? 'X' : 'O';
    setBoard(newBoard);
    setIsXNext(!isXNext);
    
    const gameWinner = calculateWinner(newBoard);
    if (gameWinner) setWinner(gameWinner);
  };

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setIsXNext(true);
    setWinner(null);
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Tic Tac Toe</h3>
        {winner ? (
          <p className="text-green-600 font-medium">Winner: {winner}! 🎉</p>
        ) : (
          <p className="text-gray-600">Next player: {isXNext ? 'X' : 'O'}</p>
        )}
      </div>
      
      <div className="grid grid-cols-3 gap-2">
        {board.map((cell, index) => (
          <button
            key={index}
            onClick={() => handleClick(index)}
            className={cn(
              "w-16 h-16 text-2xl font-bold border-2 rounded-lg transition-colors",
              "hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500",
              cell === 'X' ? "text-blue-600 bg-blue-50" : "",
              cell === 'O' ? "text-red-600 bg-red-50" : "",
              "border-gray-300"
            )}
          >
            {cell}
          </button>
        ))}
      </div>
      
      <Button onClick={resetGame} variant="outline" size="sm">
        Reset Game
      </Button>
    </div>
  );
};

const NumberMemoryGame = () => {
  const [sequence, setSequence] = useState<number[]>([]);
  const [userInput, setUserInput] = useState<number[]>([]);
  const [gameState, setGameState] = useState<'ready' | 'showing' | 'input' | 'correct' | 'wrong'>('ready');
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);

  const startGame = () => {
    const newSequence = Array.from({ length: level + 2 }, () => Math.floor(Math.random() * 10));
    setSequence(newSequence);
    setUserInput([]);
    setGameState('showing');
    
    setTimeout(() => setGameState('input'), (level + 2) * 500 + 1000);
  };

  const handleNumberClick = (num: number) => {
    if (gameState !== 'input') return;
    
    const newInput = [...userInput, num];
    setUserInput(newInput);
    
    if (newInput.length === sequence.length) {
      if (JSON.stringify(newInput) === JSON.stringify(sequence)) {
        setScore(score + level * 10);
        setLevel(level + 1);
        setGameState('correct');
        setTimeout(() => setGameState('ready'), 1500);
      } else {
        setGameState('wrong');
        setTimeout(() => {
          setLevel(1);
          setScore(0);
          setGameState('ready');
        }, 2000);
      }
    }
  };

  const resetGame = () => {
    setLevel(1);
    setScore(0);
    setGameState('ready');
    setSequence([]);
    setUserInput([]);
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Number Memory</h3>
        <div className="flex gap-4 mb-2">
          <span className="text-sm">Level: {level}</span>
          <span className="text-sm">Score: {score}</span>
        </div>
      </div>
      
      {gameState === 'ready' && (
        <div className="text-center space-y-4">
          <p className="text-gray-600">Memorize the sequence and repeat it!</p>
          <Button onClick={startGame} className="bg-green-600 hover:bg-green-700">
            <Play className="w-4 h-4 mr-2" />
            Start Level {level}
          </Button>
        </div>
      )}
      
      {gameState === 'showing' && (
        <div className="text-center space-y-4">
          <p className="text-blue-600 font-medium">Memorize this sequence:</p>
          <div className="flex gap-2 justify-center">
            {sequence.map((num, index) => (
              <div
                key={index}
                className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-xl font-bold text-blue-800"
              >
                {num}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {gameState === 'input' && (
        <div className="text-center space-y-4">
          <p className="text-gray-600">
            Enter the sequence ({userInput.length}/{sequence.length}):
          </p>
          <div className="flex gap-2 justify-center mb-4">
            {userInput.map((num, index) => (
              <div
                key={index}
                className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-sm"
              >
                {num}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => handleNumberClick(num)}
                className="w-12 h-12 bg-gray-200 hover:bg-gray-300 rounded-lg text-lg font-semibold transition-colors"
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {gameState === 'correct' && (
        <div className="text-center text-green-600">
          <Trophy className="w-8 h-8 mx-auto mb-2" />
          <p className="font-medium">Correct! +{level * 10} points</p>
        </div>
      )}
      
      {gameState === 'wrong' && (
        <div className="text-center text-red-600 space-y-2">
          <p className="font-medium">Wrong sequence!</p>
          <p className="text-sm">Game Over. Final Score: {score}</p>
        </div>
      )}
      
      <Button onClick={resetGame} variant="outline" size="sm">
        Reset Game
      </Button>
    </div>
  );
};

const GamesModal: React.FC<GamesModalProps> = ({ open, onClose }) => {
  const [selectedGame, setSelectedGame] = useState<'menu' | 'tictactoe' | 'memory'>('menu');

  const resetToMenu = () => {
    setSelectedGame('menu');
  };

  const handleClose = () => {
    resetToMenu();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-auto">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-teal-600" />
            SquidCloud Arcade
          </DialogTitle>
          <Button variant="ghost" size="sm" onClick={handleClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="space-y-4">
          {selectedGame === 'menu' && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto bg-gradient-to-br from-teal-500 to-purple-600 rounded-full flex items-center justify-center mb-3">
                  <Star className="h-8 w-8 text-white" />
                </div>
                <p className="text-gray-600">Take a break and play some games!</p>
              </div>

              <div className="grid gap-3">
                <Button
                  onClick={() => setSelectedGame('tictactoe')}
                  className="w-full p-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
                >
                  <div className="text-center">
                    <div className="font-medium">Tic Tac Toe</div>
                    <div className="text-sm opacity-90">Classic strategy game</div>
                  </div>
                </Button>

                <Button
                  onClick={() => setSelectedGame('memory')}
                  className="w-full p-4 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white"
                >
                  <div className="text-center">
                    <div className="font-medium">Number Memory</div>
                    <div className="text-sm opacity-90">Test your memory skills</div>
                  </div>
                </Button>
              </div>

              <div className="text-center text-xs text-gray-500 mt-4">
                Perfect for short breaks during uploads!
              </div>
            </div>
          )}

          {selectedGame === 'tictactoe' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={resetToMenu}>
                  ← Back to Games
                </Button>
              </div>
              <TicTacToe />
            </div>
          )}

          {selectedGame === 'memory' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={resetToMenu}>
                  ← Back to Games
                </Button>
              </div>
              <NumberMemoryGame />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GamesModal;