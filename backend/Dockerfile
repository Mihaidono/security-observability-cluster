FROM python:3.12-slim

ARG TERRAFORM_VERSION=1.14.3

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends awscli curl unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSLo /tmp/terraform.zip "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" \
    && unzip /tmp/terraform.zip -d /usr/local/bin \
    && rm /tmp/terraform.zip

WORKDIR /app/backend

COPY backend/pyproject.toml /app/backend/pyproject.toml
COPY backend/app /app/backend/app

RUN python -m pip install --upgrade pip \
    && pip install -e /app/backend

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
