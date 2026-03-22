/**
 * SHIM DE TRANSITION SOUVERAINE
 * Ce fichier est un "shim" temporaire destiné à permettre le build du projet 
 * pendant la purge complète de Supabase demandée par l'utilisateur.
 * 
 * TOUT APPEL À CE SHIM DOIT ÊTRE RÉÉCRIT POUR UTILISER L'apiClient SOUVERAIN.
 */

console.log("[SOVEREIGN] Supabase shim loaded - All calls are being intercepted.");

const createDummyQuery = (table: string | null = null) => {
    const dummyPromise = Promise.resolve({ data: [] as any, error: null, count: 0 });

    const responder: any = function () { };

    // Terminal methods directly on responder
    responder.single = () => Promise.resolve({ data: null, error: null });
    responder.maybeSingle = () => Promise.resolve({ data: null, error: null });
    responder.csv = () => Promise.resolve({ data: '', error: null });

    // Promise methods
    responder.then = (onfulfilled?: any, onrejected?: any) => dummyPromise.then(onfulfilled, onrejected);
    responder.catch = (onrejected?: any) => dummyPromise.catch(onrejected);
    responder.finally = (onfinally?: any) => dummyPromise.finally(onfinally);

    const proxy: any = new Proxy(responder, {
        get(target, prop, receiver) {
            if (prop in target) return target[prop];
            if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver);

            // To prevent "is not a function" errors, we return the proxy itself so it can be called
            return proxy;
        },
        apply() {
            // When called as a function, return the proxy to allow further chaining
            return proxy;
        }
    });

    return proxy;
};

const supabaseBase = {
    from: (table: string) => {
        console.warn(`[SOVEREIGN MIGRATION] Appel hérité à Supabase sur la table "${table}".`);
        return createDummyQuery(table);
    },
    rpc: (name: string, params?: any) => {
        console.warn(`[SOVEREIGN MIGRATION] Appel hérité à Supabase RPC "${name}".`);
        return createDummyQuery();
    },
    auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
        signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
        signInWithOtp: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
        signUp: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
        signOut: () => Promise.resolve({ error: null }),
        mfa: {
            getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }),
            listFactors: () => Promise.resolve({ data: { all: [] }, error: null }),
        }
    },
    storage: {
        from: (bucket: string) => ({
            upload: () => Promise.resolve({ data: null, error: new Error("Storage disabled") }),
            getPublicUrl: () => ({ data: { publicUrl: "" } }),
            list: () => Promise.resolve({ data: [], error: null }),
            remove: () => Promise.resolve({ data: [], error: null }),
            download: () => Promise.resolve({ data: null, error: new Error("Storage disabled") }),
        }),
    },
    channel: (name: string) => {
        console.log(`[Realtime] Subscribing to channel: ${name}`);
        const channelObj = {
            on: (event: string, filter: any, callback: any) => {
                console.log(`[Realtime] Event listener added: ${event}`);
                return channelObj; // Return the same object for chaining
            },
            subscribe: () => {
                console.log(`[Realtime] Channel ${name} subscribed`);
                return { unsubscribe: () => console.log(`[Realtime] Channel ${name} unsubscribed`) };
            }
        };
        return channelObj;
    },
    removeChannel: (channel: any) => {
        console.log("[Realtime] Dummy removeChannel called");
        return Promise.resolve();
    },
    functions: {
        invoke: () => Promise.resolve({ data: null, error: new Error("Functions disabled") }),
    }
} as any;

// Use Proxy to prevent "is not a function" errors for any unhandled Supabase properties
export const supabase = new Proxy(supabaseBase, {
    get(target, prop, receiver) {
        if (prop in target) return target[prop];
        if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver);

        // If the property is missing, return a dummy function to avoid crashes
        console.warn(`[SOVEREIGN MIGRATION] Propriété manquante accédée sur Supabase: ${String(prop)}`);
        return () => createDummyQuery();
    }
});
