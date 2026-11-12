export function findReachableTiles(sx, sy, maxSteps, gridSize, blockedTiles) {
  const key = (x, y) => y * gridSize + x;
  const distances = new Map([[key(sx, sy), 0]]);
  const queue = [[sx, sy]];

  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    const steps = distances.get(key(x, y));
    if (steps >= maxSteps) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, next = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize
        || blockedTiles.has(next) || distances.has(next)) continue;
      distances.set(next, steps + 1);
      queue.push([nx, ny]);
    }
  }

  return queue.slice(1).map(([x, y]) => ({ x, y }));
}
