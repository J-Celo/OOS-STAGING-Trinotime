        // Premium is fail-closed: Standard/basic navigation is the safe default
        // until the verified session/entitlement policy explicitly enables Premium.
        window.TRINOTIME_CONFIG = Object.assign({
            isPremium: false
        }, window.TRINOTIME_CONFIG || {});
        function isPremiumFeatureEnabled() {
            return !!(window.TRINOTIME_CONFIG && window.TRINOTIME_CONFIG.isPremium !== false);
        }
        function setTrinoPremiumMode(enabled, context = {}) {
            const next = !!enabled;
            const previous = isPremiumFeatureEnabled();
            window.TRINOTIME_CONFIG.isPremium = next;
            document.documentElement.dataset.trinoTier = next ? 'premium' : 'normal';
            if (typeof window.syncTrinoPremiumStyleGate === 'function') {
                window.syncTrinoPremiumStyleGate();
            }
            if (previous !== next) {
                try {
                    window.dispatchEvent(new CustomEvent('trinotierchange', {
                        detail: { isPremium: next, mode: next ? 'premium' : 'normal', ...context }
                    }));
                } catch (e) {}
            }
            return next;
        }
        document.documentElement.dataset.trinoTier = isPremiumFeatureEnabled() ? 'premium' : 'normal';
        window.setTrinoPremiumMode = setTrinoPremiumMode;
        window.TrinoEdition = Object.freeze({
            isPremium: isPremiumFeatureEnabled,
            setPremium: setTrinoPremiumMode,
            get mode() { return isPremiumFeatureEnabled() ? 'premium' : 'normal'; }
        });

