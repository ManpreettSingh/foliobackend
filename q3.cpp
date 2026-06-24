#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int m, n;
    cin >> m >> n;

    if (!cin || m == 0 || n < 2) {
        cout << -1 << '\n';
        return 0;
    }

    vector<vector<long long>> grid(m, vector<long long>(n));
    for (int i = 0; i < m; i++) {
        for (int j = 0; j < n; j++) {
            cin >> grid[i][j];
        }
    }

    const long long NEG = -1e18;

    vector<vector<long long>> nextDP(n, vector<long long>(n, NEG));
    vector<vector<long long>> curDP(n, vector<long long>(n, NEG));

    for (int c1 = 0; c1 < n; c1++) {
        for (int c2 = 0; c2 < n; c2++) {
            nextDP[c1][c2] = NEG;
        }
    }

    nextDP[0][n - 1] = grid[m - 1][0] + grid[m - 1][n - 1];

    for (int row = m - 2; row >= 0; row--) {
        for (int c1 = 0; c1 < n; c1++) {
            for (int c2 = 0; c2 < n; c2++) {
                curDP[c1][c2] = NEG;
            }
        }

        for (int c1 = 0; c1 < n; c1++) {
            for (int c2 = 0; c2 < n; c2++) {
                long long best = NEG;

                for (int d1 = -1; d1 <= 1; d1++) {
                    for (int d2 = -1; d2 <= 1; d2++) {
                        int nc1 = c1 + d1;
                        int nc2 = c2 + d2;

                        if (nc1 < 0 || nc1 >= n || nc2 < 0 || nc2 >= n)
                            continue;

                        best = max(best, nextDP[nc1][nc2]);
                    }
                }

                if (best == NEG) continue;

                long long coins;
                if (c1 == c2)
                    coins = grid[row][c1];
                else
                    coins = grid[row][c1] + grid[row][c2];

                curDP[c1][c2] = coins + best;
            }
        }

        swap(curDP, nextDP);
    }

    if (nextDP[0][n - 1] < 0) {
        cout << -1 << '\n';
    } else {
        cout << nextDP[0][n - 1] << '\n';
    }

    return 0;
}