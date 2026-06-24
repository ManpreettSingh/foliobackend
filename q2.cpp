#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    cin >> n >> m;

    vector<long long> arr(n + 1);
    for (int i = 1; i <= n; i++) {
        cin >> arr[i];
    }

    const long long INF = 4e18;

    vector<vector<long long>> dp(m + 1, vector<long long>(n + 1, INF));

    dp[0][0] = 0;

    for (int k = 1; k <= m; k++) {
        for (int i = k; i <= n; i++) {

            long long mx = LLONG_MIN;

            for (int j = i; j >= k; j--) {
                mx = max(mx, arr[j]);

                if (dp[k - 1][j - 1] != INF) {
                    dp[k][i] = min(
                        dp[k][i],
                        dp[k - 1][j - 1] + mx
                    );
                }
            }
        }
    }

    cout << dp[m][n] << '\n';
    return 0;
}