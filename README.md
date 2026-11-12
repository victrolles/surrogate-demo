# Surrogate Demo

Laboratoire interactif pour explorer un pendule amorti. La démo reprend le démarrage groupé et le flux WebSocket de RL Demo, ainsi que le solveur et les modèles de Pendulum Surrogate.

## Démarrage local

Prérequis utilisés pour la démo sous Windows : Python 3.13 et Node.js 24.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm ci
npm run dev
```

Ouvre [Surrogate Demo](http://127.0.0.1:5174). La commande démarre Vite sur le port 5174 et FastAPI sur le port 8001. Ctrl+C arrête les deux serveurs. Le lanceur utilise l’environnement `.venv` du projet. La variable `SURROGATE_PYTHON` peut indiquer un autre interpréteur disposant des dépendances.

```powershell
npm run test:api
npm run build
```

## Trois modes

| Mode | Réglages | Affichage |
| --- | --- | --- |
| Simulation physique | Curseurs pour la durée, L, m, b, θ₀ et ω₀ | θ(t), ω(t) et pendule animé |
| Inférence IA | Curseurs pour la durée, L, m, b, θ₀ et ω₀. Modèle et hyperparamètres | Trajectoire prédite et pendule animé |
| Comparaison | Modèle et curseurs communs aux deux trajectoires | Courbes et pendules superposés, IA en bleu et physique en orange pointillé. Erreurs moyennes absolues cumulées |

## Architecture

- **React et Vite** affichent les séries et l’animation en SVG à partir des mêmes échantillons. Vite transmet les requêtes HTTP et WebSocket sous `/api` à FastAPI.
- **FastAPI** expose `GET /health`, `GET /models` et `WS /trajectory`. Le premier message du client contient le mode et les paramètres du scénario. Le serveur envoie `started`, les `frame` indexées, puis `finished`. Le client peut envoyer `{"type":"stop"}` pour terminer par `stopped`. Les erreurs sont renvoyées sous la forme `{"type":"error","message":"..."}`.
- **SciPy** résout l’équation de référence avant le flux. Le solveur conserve le terme d’amortissement du code d’entraînement, −(b/m)L²ω. **PyTorch** prédit chaque nouvel état à partir de [L, m, b, θ, ω] et réinjecte la prédiction au pas suivant.
- En Comparaison, la référence utilise le pas d’entraînement du checkpoint. L’image initiale est partagée, à t = 0. Les erreurs commencent au premier pas et utilisent les angles bruts, en radians. Le flux est cadencé au temps simulé.

## Checkpoints

Les modèles sont entraînés à 30 Hz. Small et Medium désignent la taille du dataset. Les quatre réseaux ont une largeur de 64 neurones par couche cachée.

| Famille | Trajectoires d’entraînement | 1 couche cachée | 2 couches cachées |
| --- | ---: | --- | --- |
| MLP Small | 162 | `7vv6mwx6` | `nqqzs945` |
| MLP Medium | 9 702 | `h8u6xyth` | `8za4e0nn` |

Les poids Small proviennent de `pendulum-surrogate/runs/` et les poids Medium de `pendulum-surrogate/saved_runs/`.

Pour ajouter un modèle compatible, crée `models/<identifiant>/` avec un `model.pth` contenant le `state_dict` de `PendulumModel` et un `model.json` basé sur l’un des exemples fournis. Indique la largeur, le nombre de couches et la fréquence réellement utilisés à l’entraînement. Recharge ensuite la page pour actualiser la liste.

## Couverture du dataset

Le badge s’applique aux cinq paramètres physiques du scénario sélectionné. Les préréglages « Bon accord » et « Forte divergence » dans Inférence IA et Comparaison chargent deux scénarios de 10 s évalués avec les deux checkpoints Small.

Pour documenter un checkpoint, ajoute `training_coverage` à son `model.json`. Indique `method` et les `ranges` pour `l`, `m`, `b`, `theta0` et `omega0`, en reprenant la configuration qui a réellement servi à générer son dataset.

- `fixed_sampling` décrit le produit cartésien des listes. Le badge distingue les combinaisons de la grille, les valeurs intermédiaires et celles hors bornes.
- `random_sampling` accepte une valeur fixe ou une paire de bornes inclusives par paramètre. Le badge indique si le scénario respecte les plages de tirage.
- Si ces métadonnées sont absentes, le badge affiche « Couverture inconnue ».

Le badge décrit le scénario initial. La précision se mesure sur les trajectoires.

## Déploiement

Le [guide de déploiement](docs/deployment.md) détaille le démarrage de FastAPI sur une tour Windows, la route Cloudflare et la configuration du frontend Vite sur Vercel.
