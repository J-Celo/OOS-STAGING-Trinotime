        (() => {
            const premiumStyleIds = ["trino-premium-group-luxury", "trino-premium-group-system", "trino-premium-group-attendance"];
            const syncPremiumStyles = () => {
                const enabled = isPremiumFeatureEnabled();
                const tier = enabled ? 'premium' : 'normal';
                if (document.documentElement.dataset.trinoTier !== tier) document.documentElement.dataset.trinoTier = tier;
                premiumStyleIds.forEach(id => {
                    const style = document.getElementById(id);
                    const media = enabled ? 'all' : 'not all';
                    if (style && style.media !== media) style.media = media;
                });
            };
            window.syncTrinoPremiumStyleGate = syncPremiumStyles;
            syncPremiumStyles();

            document.addEventListener('DOMContentLoaded', syncPremiumStyles, { once: true });
        })();

