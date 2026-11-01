        (() => {
            const premiumStyleIds = ["trino-premium-group-luxury", "trino-premium-group-system", "trino-premium-group-attendance"];
            const syncPremiumStyles = () => {
                const enabled = isPremiumFeatureEnabled();
                document.documentElement.dataset.trinoTier = enabled ? 'premium' : 'normal';
                premiumStyleIds.forEach(id => {
                    const style = document.getElementById(id);
                    if (style) style.media = enabled ? 'all' : 'not all';
                });
            };
            window.syncTrinoPremiumStyleGate = syncPremiumStyles;
            syncPremiumStyles();

            document.addEventListener('DOMContentLoaded', syncPremiumStyles, { once: true });
        })();

