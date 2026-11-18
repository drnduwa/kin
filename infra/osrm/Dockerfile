# Serveur OSRM avec les données de Kinshasa préparées par cloudbuild.yaml.
ARG OSRM=ghcr.io/project-osrm/osrm-backend:v5.27.1
FROM ${OSRM}
COPY kinshasa.osrm* /data/
# Cloud Run envoie le trafic sur le port 8080
EXPOSE 8080
CMD ["osrm-routed", "--algorithm", "mld", "--port", "8080", "--max-table-size", "100", "/data/kinshasa.osrm"]
