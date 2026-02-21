import fs from 'fs';

function runTest() {
    let rows = 16;
    let cols = 30;
    let totalMines = 99;

    // play 1000 games
    for (let sim = 0; sim < 1000; sim++) {
        let grid = [];
        for (let r = 0; r < rows; r++) {
            let row = [];
            for (let c = 0; c < cols; c++) {
                row.push({ row: r, col: c, isMine: false, neighborMines: 0 });
            }
            grid.push(row);
        }

        let firstRow = Math.floor(Math.random() * rows);
        let firstCol = Math.floor(Math.random() * cols);

        let minesPlaced = 0;
        let attempts = 0;
        while (minesPlaced < totalMines && attempts < 100000) {
            attempts++;
            const r = Math.floor(Math.random() * rows);
            const c = Math.floor(Math.random() * cols);
            if (Math.abs(r - firstRow) <= 1 && Math.abs(c - firstCol) <= 1) continue;
            if (!grid[r][c].isMine) {
                grid[r][c].isMine = true;
                minesPlaced++;
            }
        }
        if (attempts >= 100000) {
            console.error('HANG in mine placement loop!');
            process.exit(1);
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (!grid[r][c].isMine) {
                    let count = 0;
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            const nr = r + dr;
                            const nc = c + dc;
                            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].isMine) {
                                count++;
                            }
                        }
                    }
                    grid[r][c].neighborMines = count;
                }
            }
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (!grid[r][c].isMine) {
                    let count = 0;
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            const nr = r + dr;
                            const nc = c + dc;
                            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].isMine) {
                                count++;
                            }
                        }
                    }
                    if (grid[r][c].neighborMines !== count) {
                        console.error('MISMATCH', r, c);
                        process.exit(1);
                    }
                }
            }
        }
    }
    console.log('OK! 1000 simulations passed.');
}
runTest();
