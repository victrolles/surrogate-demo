# Déployer Surrogate Demo

Vercel héberge l’interface React. Le navigateur charge le catalogue par HTTPS et ouvre le flux par WebSocket sécurisé vers l’adresse Cloudflare. Sur la tour, `cloudflared` transmet ces requêtes à FastAPI sur `127.0.0.1:8001`. RL Demo peut garder son propre port 8000.

## 1. Préparer GitHub et la tour Windows

Publie sur GitHub la version de `surrogate-demo` qui contient les quatre fichiers `model.pth` et leurs métadonnées. Clone ou mets à jour ce dépôt sur la tour. Depuis sa racine, prépare l’environnement avec Python 3.13.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Sur la tour, installe `cloudflared` si nécessaire, puis rouvre PowerShell et vérifie la version.

```powershell
winget install --id Cloudflare.cloudflared
cloudflared --version
```

## 2. Publier la route dans Cloudflare

Dans **Networking → Tunnels**, réutilise le tunnel de RL Demo si son connecteur tourne sur cette tour et si tous les autres connecteurs éventuels peuvent joindre la même adresse locale. Si la tour n’a pas encore de service `cloudflared`, crée un tunnel et exécute la commande d’installation Windows donnée par Cloudflare dans un PowerShell administrateur. Si un service `cloudflared` tourne déjà sur la tour, ajoute la route au tunnel de ce service. Le token d’installation reste sur la tour.

Dans **Routes → Add route → Published application**, ajoute un sous-domaine de ta zone Cloudflare, par exemple `surrogate-api.ton-domaine.fr`. Renseigne `http://127.0.0.1:8001` dans **Service URL**. Le navigateur utilisera `https://surrogate-api.ton-domaine.fr` et `wss://surrogate-api.ton-domaine.fr/trajectory`.

[Configurer un tunnel](https://developers.cloudflare.com/tunnel/get-started/) · [Ajouter une route à un tunnel existant](https://developers.cloudflare.com/cloudflare-one/networks/routes/add-routes/) · [WebSockets dans Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/)

## 3. Déployer l’interface dans Vercel

Importe le dépôt GitHub comme projet Vercel et choisis **Vite** et **Node.js 24**. Garde la racine du dépôt, `npm run build` comme commande de build et `dist` comme dossier de sortie. Dans les variables **Production**, définis `VITE_API_BASE_URL` avec l’URL HTTPS du sous-domaine Cloudflare, par exemple `https://surrogate-api.ton-domaine.fr`. La valeur correspond à la racine de l’API.

Lance le déploiement et relève l’origine stable de production. Une modification de `VITE_API_BASE_URL` nécessite de redéployer le frontend.

[Vite sur Vercel](https://vercel.com/docs/frameworks/frontend/vite) · [Paramètres du build](https://vercel.com/docs/builds/configure-a-build) · [Variables d’environnement](https://vercel.com/docs/environment-variables/managing-environment-variables)

## 4. Démarrer FastAPI sur la tour

Lance FastAPI depuis la racine de Surrogate Demo.

```powershell
.\.venv\Scripts\python.exe -m uvicorn server.app:app --host 127.0.0.1 --port 8001 --ws-max-size 4096
```

FastAPI autorise par défaut `https://surrogate-demo-chi.vercel.app` et `https://surrogate-demo.victorgoudal.fr` pour la lecture du catalogue et l’ouverture du WebSocket. Pour autoriser d’autres origines, renseigne `SURROGATE_CORS_ORIGINS` en les séparant par des virgules. FastAPI accepte jusqu’à quatre trajectoires simultanées sur ce processus. La tour, le service Cloudflare et FastAPI doivent rester actifs pendant l’utilisation de la démo.

## 5. Vérifier depuis un autre appareil

Teste d’abord `/health`, puis `/models` sur le sous-domaine Cloudflare. Le premier doit renvoyer `{"status":"ok"}` et le second doit lister les quatre checkpoints. Ouvre ensuite l’URL Vercel et lance une comparaison. Dans l’onglet **Réseau → WS** des outils développeur, la requête `wss://…/trajectory` doit s’ouvrir avec le statut 101.

- Si Cloudflare renvoie une 502, vérifie sur la tour que `http://127.0.0.1:8001/health` répond et que la route pointe sur ce port.
- Si le catalogue est bloqué par CORS ou que le WebSocket reçoit une 403, vérifie l’origine exacte de l’interface. Si elle diffère des origines autorisées par défaut, ajoute-la à `SURROGATE_CORS_ORIGINS` et redémarre FastAPI.
- Si Vercel appelle `/api/models` sur son propre domaine, vérifie la variable `VITE_API_BASE_URL` puis redéploie.

En développement, `npm run dev` garde le proxy Vite local lorsque `VITE_API_BASE_URL` est vide.
