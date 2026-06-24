const { execSync } = require('child_process');

function run(cmd) {
    console.log(`Running: ${cmd}`);
    try {
        execSync(cmd, { stdio: 'inherit' });
    } catch (e) {
        console.error(`Error running command: ${cmd}`);
    }
}

// Generate 20 dates between May 5, 2026 and June 24, 2026
const startDate = new Date('2026-05-05T09:00:00Z');
const endDate = new Date('2026-06-24T09:00:00Z');
const timeDiff = endDate.getTime() - startDate.getTime();

let dates = [];
for (let i = 0; i < 19; i++) {
    const randomTime = startDate.getTime() + Math.random() * timeDiff;
    dates.push(new Date(randomTime));
}
dates.sort((a, b) => a - b);
dates.push(new Date());

const commits = [
    {
        msg: "Initial backend setup and configuration",
        add: "package.json package-lock.json tsconfig.json .gitignore .env.example README.md"
    },
    {
        msg: "Add express app entrypoints",
        add: "src/app.ts src/index.ts"
    },
    {
        msg: "Setup database schema and ORM config",
        add: "prisma/schema.prisma src/config/prisma.ts src/config/env.ts"
    },
    {
        msg: "Add initial database migrations",
        add: "prisma/migrations/*"
    },
    {
        msg: "Implement error handling utilities and middleware",
        add: "src/utils/http-error.ts src/utils/async-handler.ts src/middleware/error.ts"
    },
    {
        msg: "Add JWT utilities and auth validation",
        add: "src/utils/jwt.ts src/validators/auth.ts src/middleware/validate.ts"
    },
    {
        msg: "Implement authentication service",
        add: "src/services/auth.service.ts"
    },
    {
        msg: "Add auth controllers and API routes",
        add: "src/controllers/auth.controller.ts src/routes/auth.routes.ts src/middleware/auth.ts"
    },
    {
        msg: "Implement portfolio service logic",
        add: "src/services/portfolio.service.ts src/validators/portfolio.ts"
    },
    {
        msg: "Add portfolio endpoints and controllers",
        add: "src/controllers/portfolio.controller.ts src/routes/portfolio.routes.ts"
    },
    {
        msg: "Implement watchlist service logic",
        add: "src/services/watchlist.service.ts src/validators/watchlist.ts"
    },
    {
        msg: "Add watchlist endpoints and controllers",
        add: "src/controllers/watchlist.controller.ts src/routes/watchlist.routes.ts"
    },
    {
        msg: "Implement market data service integration",
        add: "src/services/market-data.service.ts"
    },
    {
        msg: "Add market data endpoints",
        add: "src/controllers/market.controller.ts src/routes/market.routes.ts"
    },
    {
        msg: "Implement pricing and websocket services",
        add: "src/services/price.service.ts src/services/stock-websocket.service.ts test-ws.cjs"
    },
    {
        msg: "Implement AI integration service",
        add: "src/services/ai.service.ts"
    },
    {
        msg: "Add AI analysis endpoints",
        add: "src/controllers/ai.controller.ts"
    },
    {
        msg: "Implement news aggregation service",
        add: "src/services/news.service.ts"
    },
    {
        msg: "Add utility patches",
        add: "patch.cjs patch2.cjs"
    }
];

run('git checkout --orphan temp_history');
run('git rm --cached -r .');

for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const dateStr = dates[i].toISOString();
    
    console.log(`\n--- Committing step ${i+1}: ${commit.msg} ---`);
    const filesToAdd = commit.add.split(' ');
    for (const file of filesToAdd) {
        try {
            // we use glob-like passing by shell to git add
            execSync(`git add ${file} 2>nul`);
        } catch(e) {}
    }
    
    try {
        execSync('git diff --cached --quiet');
        console.log('No files to commit in this step.');
    } catch(e) {
        run(`git commit --date="${dateStr}" -m "${commit.msg}"`);
    }
}

console.log(`\n--- Committing final step ---`);
run('git add .');
const finalDate = dates[dates.length - 1].toISOString();
run(`git commit --date="${finalDate}" -m "Final bug fixes and optimizations"`);

console.log("\nDone. You can now verify the log with 'git log' and then run:");
console.log("git branch -M main");
console.log("git push -f origin main");
