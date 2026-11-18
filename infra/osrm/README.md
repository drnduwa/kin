# Serveur d'itinéraires OSRM (Mode Conduite)

Le Mode Conduite calcule ses itinéraires avec [OSRM](https://project-osrm.org/) sur les routes
OpenStreetMap de Kinshasa, sur notre propre serveur Cloud Run `osrm-kinshasa`
(projet `studio-874039458-d0447`, région `us-central1`).

## Construire et déployer

Depuis la racine du projet, avec le Google Cloud CLI connecté au compte du projet :

```powershell
& .\infra\osrm\deploy.ps1
```

Le script active les services nécessaires, construit l'image dans Cloud Build (`cloudbuild.yaml` :
carte RDC de Geofabrik → découpe de Kinshasa → préparation OSRM « voiture »), la déploie sur Cloud Run,
teste un trajet et affiche l'adresse à mettre dans `OSRM_URL` (`apphosting.yaml`).

Relancer le script de temps en temps (par exemple une fois par mois) pour suivre les mises à jour
d'OpenStreetMap : les nouvelles rues et corrections faites par les contributeurs de Kinshasa.

## Réglages

- **En veille hors usage** (`min-instances 0`) : quasi gratuit, mais le premier itinéraire après une
  pause prend quelques secondes. Pour l'éviter : `--min-instances 1` (≈ 10–15 $ par mois).
- **2 instances au plus** : limite le coût si quelqu'un abuse de l'adresse publique.
- Zone couverte : 15,0–15,9 E, 4,0–4,75 S (Kinshasa et abords). Hors zone, l'API de l'app refuse le trajet.

Données © contributeurs OpenStreetMap, licence ODbL.
