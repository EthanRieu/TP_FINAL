# BidFlow — API Marketplace d'enchères

> TP individuel 5h · ESGI Reims Bac+3 · Stack : Node.js 22 · Express · TypeScript · MongoDB · Socket.io · Docker

---

## Lancer le projet

```bash
cp .env.example .env
docker compose up --build
```

- **API** → http://localhost:3000
- **Frontend démo** → http://localhost:3000 (détail dans /src/public/index.html (fait à l'IA pour gain de temps niveau front))
- **MongoDB** → localhost:27017

Pour créer un compte modérateur, que via la DB :

```bash
# Depuis mongosh ou Compass — ajouter manuellement en base :
db.users.insertOne({
  email: "moderator@bidflow.com",
  password: "$2a$12$...",   // bcrypt hash
  roles: ["buyer", "moderator"],
  isActive: true,
  createdAt: new Date()
})
```

---

## Stack technique

| Outil | Rôle |
|---|---|
| Node.js 22 + Express | Serveur HTTP |
| TypeScript strict | Typage statique, détection d'erreurs à la compilation |
| MongoDB + Mongoose | Base de données NoSQL orientée documents |
| Socket.io | Notifications temps réel (enchères, mises) |
| JWT + bcryptjs | Authentification stateless, hachage des mots de passe |
| Multer | Upload de photos (max 5 par produit) |
| Zod | Validation des corps de requêtes |
| Docker + docker-compose | Conteneurisation de l'API et de MongoDB |

---

## Architecture

```
src/
├── app.ts              — création de l'app Express (middlewares + routes + error handler)
├── server.ts           — point d'entrée : connexion DB, Socket.io, démarrage serveur
├── config/             — db.ts · env.ts · multer.ts
├── middleware/         — auth · requireRole · validate · bidRateLimiter
├── models/             — User · Product · Auction · Bid · AutoBid
├── services/           — auction · bid · commission (logique métier pure)
├── controllers/        — auth · product · auction · bid · admin
├── routes/             — un fichier par domaine
├── socket/             — initialisation Socket.io + constantes des events
├── types/              — interfaces TypeScript partagées
└── utils/              — ApiError · asyncWrapper
```

### Pourquoi cette organisation ?

J'ai choisi une architecture **MVC en couches** : les routes définissent les URLs, les controllers gèrent les requêtes/réponses HTTP, et les services contiennent la logique métier. Cette séparation permet de tester un service indépendamment d'une requête HTTP, et de garder les controllers courts et lisibles.

Toute gestion d'erreur est centralisée dans un seul middleware dans `app.ts`. Les controllers n'ont jamais de `try/catch` — ils sont tous wrappés par `asyncWrapper.ts` qui renvoie les erreurs au handler global automatiquement. Ce n'était pas imposé par le TP, c'est un choix délibéré : sans ce pattern, chaque controller devrait répéter le même bloc `try/catch`. Sur 15 controllers, ça représente beaucoup de code identique. Avec `wrap()`, toute exception levée n'importe où (service, Mongoose, validation Zod) remonte automatiquement au handler qui retourne un JSON d'erreur cohérent avec le bon status HTTP.

---

## Décisions de modélisation

### B1 — Un compte, plusieurs rôles

**Choix : `roles: ('buyer' | 'seller' | 'moderator')[]`**

Un email = un seul compte. Plutôt qu'un booléen `isSeller`, j'ai opté pour un tableau de rôles. Ça permet à un utilisateur d'être à la fois acheteur et vendeur (un artisan qui revend ses créations peut aussi acheter), sans créer deux comptes.

L'upgrade vendeur fonctionne avec `$addToSet: { roles: 'seller' }` — opération atomique MongoDB qui n'ajoute le rôle qu'une seule fois. Le modérateur approuve la demande via `/api/admin/seller-requests/:id`.

Les modérateurs ne peuvent pas être créés via l'API : ils sont insérés directement en base via un seed script, ce qui évite toute élévation de privilège non contrôlée.

### B2 — Produit découplé de l'enchère

Le statut du produit est indépendant de l'enchère : `draft → in_auction → sold | suspended`.

- **Modifier titre/description** : bloqué si une enchère est `active` (on ne change pas les règles du jeu en cours de partie)
- **Photos** : même règle, modifiables uniquement en `draft` ou `scheduled`
- **Enchère annulée** : le produit revient en `draft`, le vendeur peut relancer
- **Enchère suspendue par un modérateur** : le produit passe en `suspended`, toutes les mises sont gelées

### B3 — Enchère anglaise uniquement

J'ai choisi d'implémenter **un seul format en profondeur** plutôt que trois superficiellement. L'enchère anglaise est montante, publique, avec prix de réserve secret optionnel. Toute la complexité métier est concentrée dans `bid.service.ts` et `auction.service.ts`.

Le champ `reservePrice` est déclaré avec `select: false` dans Mongoose : il n'est **jamais** inclus dans les réponses JSON par défaut. On ne peut le lire qu'en ajoutant explicitement `.select('+reservePrice')` côté serveur, lors de la clôture.

### Race condition — Optimistic locking sans transaction

Deux acheteurs qui misent le même montant à 10 ms d'écart : un seul doit passer. La solution est un `findOneAndUpdate` avec une **condition atomique** sur `currentPrice` :

```typescript
Auction.findOneAndUpdate(
  { _id: auctionId, status: 'active', currentPrice: { $lt: amount } },
  { $set: { currentPrice: amount, currentWinner: bidderId } }
)
```

MongoDB exécute cette opération de façon atomique au niveau du document. Si deux requêtes arrivent simultanément pour 150 € alors que le prix courant est 100 €, la première réussit et met le prix à 150 €. La seconde trouve `currentPrice: 150` qui n'est **pas** `< 150`, et échoue proprement avec une 409. Pas besoin de transactions distribuées ni de replica set.

### B8 — Fermeture des enchères : double mécanisme

J'ai choisi une approche **lazy close + setTimeout** :

- **Lazy close** : à chaque `GET /auctions/:id`, si `endAt < maintenant` et `status === 'active'`, on clôture immédiatement. Ça coûte rien si personne ne consulte.
- **setTimeout** : au `POST /auctions/:id/start`, on programme un `setTimeout` pour l'heure exacte de fin. Si le serveur redémarre entre temps, le lazy close prend le relais à la première consultation.

Compromis assumé : quelques secondes de décalage possible si personne ne consulte l'enchère et que le serveur redémarre. Acceptable pour un MVP — un cron `node-cron` résoudrait ça mais ça complexifie le déploiement sans apport visible pour la démo.

---

## Routes API

```
── AUTH ──────────────────────────────────────────────────────────────
POST   /api/auth/register                   Inscription → roles: ['buyer']
POST   /api/auth/login                      Connexion → { token }
POST   /api/auth/upgrade-seller  [auth]     Demande upgrade vendeur

── PRODUITS ──────────────────────────────────────────────────────────
GET    /api/products                        Liste publique
POST   /api/products             [seller]   Créer + upload photos (max 5)
GET    /api/products/:id                    Détail
PATCH  /api/products/:id         [seller]   Modifier (bloqué si in_auction)
DELETE /api/products/:id         [seller]   Supprimer (seulement si draft)

── ENCHÈRES ──────────────────────────────────────────────────────────
GET    /api/auctions                        Liste (filtre: status)
POST   /api/auctions             [seller]   Créer une enchère
GET    /api/auctions/:id                    Détail + lazy close automatique
POST   /api/auctions/:id/start   [seller]   Démarrer → active + setTimeout
POST   /api/auctions/:id/cancel  [seller|mod] Annuler + cascade produit
POST   /api/auctions/:id/watch   [auth]     Rejoindre la room Socket.io
DELETE /api/auctions/:id/watch   [auth]     Quitter la room

── MISES ─────────────────────────────────────────────────────────────
POST   /api/auctions/:id/bids    [buyer]    Miser (toutes les règles)
GET    /api/auctions/:id/bids               Historique des mises

── AUTO-BID ──────────────────────────────────────────────────────────
POST   /api/auctions/:id/autobid [buyer]    Configurer un auto-bid
DELETE /api/auctions/:id/autobid [buyer]    Désactiver son auto-bid

── ADMIN ─────────────────────────────────────────────────────────────
GET    /api/admin/reports                   [mod] Reporting B11
GET    /api/admin/users                     [mod] Lister les utilisateurs
GET    /api/admin/seller-requests           [mod] Demandes upgrade en attente
PATCH  /api/admin/seller-requests/:id       [mod] Approuver ou refuser
PATCH  /api/admin/users/:id/suspend         [mod] Suspendre + cascade enchères
PATCH  /api/admin/users/:id/activate        [mod] Réactiver
PATCH  /api/admin/products/:id/suspend      [mod] Suspendre + cascade enchère
PATCH  /api/admin/products/:id/activate     [mod] Réactiver
```

---

## Events Socket.io

| Event | Direction | Payload |
|---|---|---|
| `bid_placed` | Serveur → clients | `{ auctionId, amount, currentPrice, bidderId }` |
| `auction_extended` | Serveur → clients | `{ auctionId, newEndAt, extensionCount }` |
| `auction_closed` | Serveur → clients | `{ auctionId, winner, finalPrice, commission, reserveMet }` |
| `watch` | Client → serveur | `auctionId` — rejoint la room |
| `unwatch` | Client → serveur | `auctionId` — quitte la room |

Les clients s'abonnent à une enchère via l'event `watch`. Socket.io crée une **room** par `auctionId` : seuls les watchers de cette enchère reçoivent ses events.

---

## Cas tricky implémentés

### ✅ #1 — Race condition sur bid

Deux acheteurs misent simultanément le même montant. Solution : `findOneAndUpdate` atomique avec condition `{ currentPrice: { $lt: amount } }`. Le second échoue bien avec une 409.

### ✅ #2 — Reserve price non atteint

À la clôture, `auctionService.close()` vérifie si `currentPrice >= reservePrice`. Si non : `status = 'closed'`, `winner = null`, le produit repasse en `draft`. Le vendeur peut relancer une nouvelle enchère.

### ✅ #3 — Anti-sniping

Dans `bid.service.ts`, après chaque mise acceptée :

```typescript
const timeLeft = updated.endAt.getTime() - Date.now();
if (timeLeft < 30_000) {
  // endAt += 60 secondes
  // envoie AUCTION_EXTENDED à tous les watchers
}
```

Le frontend démo (`public/index.html`) illustre ce cas : mise à T-15s → le compteur passe à +60s.

### ✅ #4 — Auto-bid mutuel sans boucle infinie

`autobid.service.ts` utilise un algorithme séquentiel avec un compteur `cycle` (max 100 itérations de sécurité). Après chaque mise auto, on cherche le meilleur auto-bid concurrent trié par `registeredAt ASC` (priorité FIFO en cas d'égalité de budget).

### ✅ #5 — Anti-fraude mise × 10

Mise > 10× le prix courant sans `confirmed: true` → rejet 400 avec `{ requireConfirmation: true }`. Le client doit renvoyer la requête avec `"confirmed": true` pour passer.

### ✅ #6 — Modération avec cascade

Suspendre un vendeur → toutes ses enchères `active` et `scheduled` sont annulées automatiquement, les watchers reçoivent l'event `auction_closed`, les produits passent en `suspended`.

Suspendre un produit → l'enchère active dessus est annulée de la même façon.

---

## Ce qui n'est PAS implémenté

| Fonctionnalité | Raison |
|---|---|
| Enchère hollandaise (B3 format B) | Hors scope — un format en profondeur vaut mieux |
| Enchère scellée (B3 format C) | Idem |
| Tests automatisés | Non |
| Swagger UI | Non |
| Cron node-cron | Remplacé par lazy close + setTimeout |
| Notification `outbid` individuelle | L'event `bid_placed` diffusé à la room seulement |

---

## Démonstration anti-sniping (frontend)

Ouvrir http://localhost:3000 dans le navigateur.

**Étape 1 — Créer un compte et demander le rôle seller**

1. S'inscrire avec `seller@bidflow.com` → le compte est créé avec `roles: ['buyer']`
2. Se connecter, aller dans son profil
3. Cliquer sur "Demander à devenir vendeur" → la demande passe en `pending`

**Étape 2 — Approuver la demande (compte modérateur)**

4. Se déconnecter, se connecter avec `moderator@bidflow.com` (créé manuellement en base, voir section "Lancer le projet")
5. Dans le dashboard admin → section "Demandes vendeur"
6. Approuver la demande de `seller@bidflow.com` → `$addToSet: { roles: 'seller' }` est appliqué

**Étape 3 — Créer le produit et l'enchère (compte seller)**

7. Se déconnecter, se reconnecter avec `seller@bidflow.com`
8. Le compte a maintenant `roles: ['buyer', 'seller']` → accès au dashboard vendeur
9. Créer un produit (titre, catégorie, état)
10. Créer une enchère sur ce produit avec `endAt = maintenant + 25 secondes` et un prix de départ
11. Démarrer l'enchère → elle passe en `active`

**Étape 4 — Enchérir (compte buyer)**

12. Se déconnecter, s'inscrire avec `buyer@bidflow.com` → compte créé avec `roles: ['buyer']`
13. Naviguer vers le détail de l'enchère
14. Observer le countdown en temps réel
15. Miser dans les 30 dernières secondes
16. Le compteur saute de +60 secondes et le bandeau **"⏰ Enchère prolongée de 60s !"** apparaît

**Étape 5 — Vérifier via le panel admin (compte modérateur)**

17. Se déconnecter, se reconnecter avec `moderator@bidflow.com`
18. Dans le dashboard admin : consulter le reporting (enchères par statut, taux de conversion, commissions)

---

## Utilisation de l'IA

**Frontend (`public/index.html`)** : entièrement généré par IA. Le front n'est pas l'objet du TP, il sert uniquement à démontrer le cas anti-sniping visuellement.

**Backend** : la réflexion, la structure et le plan d'implémentation des features ont été faits de façon autonome. L'IA a été utilisée en complément pour :
- la validation des choix d'architecture et des décisions de modélisation (parfois suggérer des ajustements auxquels j'avais pas pensé)
- du debug (erreurs TypeScript, comportements bizares)
- une aide sur les parties Socket.io et Multer
- quelques conseils lors de la création de certains fichiers