# Construit et déploie le serveur d'itinéraires OSRM de Kinshasa sur Cloud Run.
# À lancer depuis la racine du projet :  & .\infra\osrm\deploy.ps1
# Prérequis : Google Cloud CLI installé et connecté (gcloud auth login) au compte du projet Firebase.

$gcloud  = "$env:USERPROFILE\google-cloud-cli\google-cloud-sdk\bin\gcloud.cmd"
$project = 'studio-874039458-d0447'
$region  = 'us-central1'
$service = 'osrm-kinshasa'
$image   = "$region-docker.pkg.dev/$project/osrm/kinshasa:latest"

function Step($label) { Write-Host ""; Write-Host "==> $label" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { Write-Host "ECHEC : $what" -ForegroundColor Red; exit 1 } }

Step "Projet $project"
& $gcloud config set project $project | Out-Null; Check "choix du projet"

Step "Services Google Cloud (Cloud Run, Cloud Build, Artifact Registry)"
& $gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com; Check "activation des services"

Step "Dépôt d'images 'osrm'"
& $gcloud artifacts repositories describe osrm --location $region --format "value(name)" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  & $gcloud artifacts repositories create osrm --repository-format=docker --location $region --description "Serveur OSRM Kinshasa"; Check "création du dépôt"
} else { Write-Host "déjà présent" }

Step "Construction dans Cloud Build (carte RDC -> Kinshasa -> OSRM), 10 a 15 min"
& $gcloud builds submit infra/osrm --config infra/osrm/cloudbuild.yaml; Check "construction"

Step "Déploiement Cloud Run '$service' (en veille hors usage, 2 instances au plus)"
& $gcloud run deploy $service --image $image --region $region --port 8080 --memory 1Gi --cpu 1 `
  --min-instances 0 --max-instances 2 --concurrency 40 --timeout 30 --allow-unauthenticated; Check "déploiement"

$url = & $gcloud run services describe $service --region $region --format "value(status.url)"; Check "lecture de l'adresse"

Step "Test : Gombe (Mandela) -> Masina (Pascal)"
$test = Invoke-RestMethod "$url/route/v1/driving/15.298,-4.312;15.420,-4.385?overview=false"
Write-Host ("code={0}  distance={1:N1} km  duree={2:N0} min" -f $test.code, ($test.routes[0].distance / 1000), ($test.routes[0].duration / 60))

Write-Host ""
Write-Host "OSRM_URL=$url" -ForegroundColor Green
