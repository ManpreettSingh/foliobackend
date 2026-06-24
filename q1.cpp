#include <bits/stdc++.h>
using namespace std;

// Helper function to check if a given turn is enough to defeat the titan
bool canDefeat(long long turn, long long d, int m, const vector<long long>& a, const vector<long long>& r) {
    // Using __int128 to completely eliminate any integer overflow risks during summation
    __int128 totalDamage = 0;

    for (int i = 0; i < m; i++) {
        // Correct math: 1st attack is at turn 1. Next are at 1+r, 1+2r, etc.
        long long attacks = (turn - 1) / r[i] + 1;
        totalDamage += (unsigned __int128)attacks * a[i];

        if (totalDamage >= d) return true;
    }
    return totalDamage >= d;
}

int main() {
    // Optimize I/O
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    long long d;
    int m;
    if (!(cin >> d >> m)) return 0;

    vector<long long> a(m), r(m);
    for (int i = 0; i < m; i++) cin >> a[i];
    for (int i = 0; i < m; i++) cin >> r[i];

    // Binary search boundaries
    long long lo = 1;
    long long hi = 1e18; // 1e18 is a safely massive upper bound for the max possible turns
    long long ans = hi;

    // Execute Binary Search
    while (lo <= hi) {
        long long mid = lo + (hi - lo) / 2;
        
        if (canDefeat(mid, d, m, a, r)) {
            ans = mid;      // This turn works, save it
            hi = mid - 1;   // Try to find an even earlier valid turn
        } else {
            lo = mid + 1;   // Not enough damage, we need more time
        }
    }

    cout << ans << '\n';
    return 0;
}