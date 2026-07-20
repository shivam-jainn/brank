DEV_COMPOSE  := compose-dev.yml
PROD_COMPOSE := compose.yml
COMPOSE      := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

.PHONY: help
help:
	@echo "┌──────────────────────────────────────────────────────────────┐"
	@echo "│  \033[1mBrank — Deploy Commands\033[0m                                      │"
	@echo "└──────────────────────────────────────────────────────────────┘"
	@echo ""
	@echo "  \033[1mQuick start\033[0m"
	@echo "    make deploy       Auto-detect: K8s (preferred) or Docker"
	@echo "    make destroy      Tear down whatever was deployed"
	@echo ""
	@echo "  \033[1mDocker Compose\033[0m"
	@echo "    make deploy DEPLOY_METHOD=compose"
	@echo "    make up           Start full stack"
	@echo "    make down         Stop"
	@echo "    make logs         Tail logs"
	@echo "    make ps           List containers"
	@echo "    make dev <c>      Dev mode (c = ia, iaw, all)"
	@echo "    make dev-down     Stop dev"
	@echo "    make dev-logs     Tail dev logs"
	@echo ""
	@echo "  \033[1mKubernetes (kind / k3d)\033[0m"
	@echo "    make deploy DEPLOY_METHOD=k8s"
	@echo "    make deploy       (auto-detects kubectl)"
	@echo ""
	@echo "    \033[33mIndividual steps (run in order if needed):\033[0m"
	@echo "    make _k8s-cluster-create   Create cluster + ingress"
	@echo "    make _k8s-build            Build Docker images"
	@echo "    make _k8s-load             Load images into cluster"
	@echo "    make _helm-upgrade         Helm install/upgrade"
	@echo "    make _k8s-deploy           All of the above"
	@echo ""
	@echo "    \033[33mTeardown / inspect:\033[0m"
	@echo "    make _k8s-cluster-delete   Delete cluster"
	@echo "    make _helm-uninstall       Remove Helm release"
	@echo "    make _k8s-destroy          Both of the above"
	@echo ""
	@echo "  \033[1mOther\033[0m"
	@echo "    make clean        Stop + remove volumes (Docker only)"
	@echo "    make help         This help"

.PHONY: up
up: ## Start the full stack (Docker Compose)
	$(COMPOSE) -f $(PROD_COMPOSE) up --build -d

.PHONY: down
down: ## Stop the full stack
	$(COMPOSE) -f $(PROD_COMPOSE) down

.PHONY: logs
logs: ## Tail logs
	$(COMPOSE) -f $(PROD_COMPOSE) logs -f

.PHONY: ps
ps: ## List running containers
	$(COMPOSE) -f $(PROD_COMPOSE) ps

## ─── Development ──────────────────────────────────────────────────────

ARG      := $(filter-out dev,$(MAKECMDGOALS))
ifeq ($(ARG),all)
PROFILES := --profile infra --profile app --profile workers
else
PROFILES := $(if $(findstring i,$(ARG)),--profile infra,) \
            $(if $(findstring a,$(ARG)),--profile app,) \
            $(if $(findstring w,$(ARG)),--profile workers,)
endif

.PHONY: dev
dev: ## Start dev
	@if [ -z "$(strip $(PROFILES))" ]; then \
		echo "usage: make dev <combo>  (i=infra a=app w=workers, or 'all')"; \
		echo "example: make dev ia"; exit 1; \
	fi
	$(COMPOSE) -f $(DEV_COMPOSE) $(PROFILES) up --build -d

.PHONY: dev-down
dev-down: ## Stop dev
	$(COMPOSE) -f $(DEV_COMPOSE) --profile infra --profile app --profile workers down

.PHONY: dev-logs
dev-logs: ## Tail dev logs
	$(COMPOSE) -f $(DEV_COMPOSE) logs -f

ifneq ($(ARG),)
ifneq ($(shell echo "$(ARG)" | grep -cE '^[iaw]+$$|^all$$'),0)
$(ARG):
	@:
endif
endif

## ─── Unified Deploy ───────────────────────────────────────────────────

DEPLOY_METHOD ?= auto

K8S_CLUSTER_NAME ?= brank
K8S_NAMESPACE    ?= brank
HELM_RELEASE     ?= brank
K8S_HOST         ?= brank.local
K8S_BUILD_TAG    ?= latest
HELM_TIMEOUT     ?= 180s

-include .env.local

.PHONY: deploy destroy

deploy:
	@case "$(DEPLOY_METHOD)" in \
		k8s)     $(MAKE) _k8s-deploy ;; \
		compose) $(MAKE) up ;; \
		auto) \
			if command -v kubectl >/dev/null && kubectl cluster-info --request-timeout=3s >/dev/null 2>&1; then \
				$(MAKE) _k8s-deploy; \
			else \
				$(MAKE) up; \
			fi ;; \
		*) \
			echo "Error: DEPLOY_METHOD must be 'k8s', 'compose', or 'auto'"; \
			exit 1 ;; \
	esac

destroy:
	@if command -v helm >/dev/null && helm status "$(HELM_RELEASE)" --namespace "$(K8S_NAMESPACE)" >/dev/null 2>&1; then \
		$(MAKE) _k8s-destroy; \
	else \
		$(COMPOSE) -f $(PROD_COMPOSE) down; \
	fi

## ─── Cleanup ──────────────────────────────────────────────────────────

.PHONY: clean
clean: ## Stop everything and remove volumes
	$(COMPOSE) -f $(PROD_COMPOSE) down -v
	$(COMPOSE) -f $(DEV_COMPOSE) --profile infra --profile app --profile workers down -v

# ── Internal K8s helpers (hidden from help) ────────────────────────────

.PHONY: _k8s-cluster-create _k8s-cluster-delete _k8s-build _k8s-load _helm-upgrade _helm-uninstall _k8s-deploy _k8s-destroy

_k8s-cluster-create:
	@if command -v kind >/dev/null; then \
		if ! kind get clusters 2>/dev/null | grep -qx "$(K8S_CLUSTER_NAME)"; then \
			echo "==> Creating kind cluster '$(K8S_CLUSTER_NAME)'"; \
			kind create cluster --name "$(K8S_CLUSTER_NAME)"; \
			echo "==> Installing nginx ingress controller"; \
			kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml; \
			kubectl wait --namespace ingress-nginx --for=condition=ready pod \
				--selector=app.kubernetes.io/component=controller --timeout=120s; \
		else \
			echo "kind cluster '$(K8S_CLUSTER_NAME)' already exists"; \
		fi; \
	elif command -v k3d >/dev/null; then \
		if ! k3d cluster list 2>/dev/null | grep -qw "$(K8S_CLUSTER_NAME)"; then \
			echo "==> Creating k3d cluster '$(K8S_CLUSTER_NAME)'"; \
			k3d cluster create "$(K8S_CLUSTER_NAME)" --k3s-arg '--disable=traefik@server:*'; \
			echo "==> Installing nginx ingress controller"; \
			kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml; \
			kubectl wait --namespace ingress-nginx --for=condition=ready pod \
				--selector=app.kubernetes.io/component=controller --timeout=120s; \
		else \
			echo "k3d cluster '$(K8S_CLUSTER_NAME)' already exists"; \
		fi; \
	else \
		echo "Error: need kind or k3d.  brew install kind"; exit 1; \
	fi

_k8s-cluster-delete:
	@if command -v kind >/dev/null && kind get clusters 2>/dev/null | grep -qx "$(K8S_CLUSTER_NAME)"; then \
		kind delete cluster --name "$(K8S_CLUSTER_NAME)"; \
	elif command -v k3d >/dev/null && k3d cluster list 2>/dev/null | grep -qw "$(K8S_CLUSTER_NAME)"; then \
		k3d cluster delete "$(K8S_CLUSTER_NAME)"; \
	fi

_k8s-build:
	docker build -t brank:$(K8S_BUILD_TAG) .
	docker build -t brank-worker:$(K8S_BUILD_TAG) -f Dockerfile.worker .

_k8s-load: _k8s-build
	@if command -v kind >/dev/null && kind get clusters 2>/dev/null | grep -qx "$(K8S_CLUSTER_NAME)"; then \
		kind load docker-image brank:$(K8S_BUILD_TAG) --name "$(K8S_CLUSTER_NAME)" && \
		kind load docker-image brank-worker:$(K8S_BUILD_TAG) --name "$(K8S_CLUSTER_NAME)"; \
	elif command -v k3d >/dev/null && k3d cluster list 2>/dev/null | grep -qw "$(K8S_CLUSTER_NAME)"; then \
		k3d image import brank:$(K8S_BUILD_TAG) --cluster "$(K8S_CLUSTER_NAME)" && \
		k3d image import brank-worker:$(K8S_BUILD_TAG) --cluster "$(K8S_CLUSTER_NAME)"; \
	else \
		echo "No cluster '$(K8S_CLUSTER_NAME)'. Run 'make deploy' first."; exit 1; \
	fi

_helm-upgrade:
	helm upgrade --install "$(HELM_RELEASE)" ./helm/brank \
		--namespace "$(K8S_NAMESPACE)" --create-namespace \
		--set image.tag=$(K8S_BUILD_TAG) \
		--set workerImage.tag=$(K8S_BUILD_TAG) \
		--set app.replicas=1 \
		--set secrets.OPENAI_API_KEY="$(or $(OPENAI_API_KEY),sk-placeholder)" \
		--set secrets.BETTER_AUTH_SECRET="$(or $(BETTER_AUTH_SECRET),$(shell openssl rand -base64 32))" \
		--set "secrets.DATABASE_URL=postgresql://brank:brank@$(HELM_RELEASE)-postgres:5432/brank" \
		--set "secrets.RABBITMQ_URL=amqp://brank:brank@$(HELM_RELEASE)-rabbitmq:5672" \
		--set "secrets.REDIS_URL=redis://$(HELM_RELEASE)-redis:6379" \
		--wait --timeout $(HELM_TIMEOUT)

_helm-uninstall:
	helm uninstall "$(HELM_RELEASE)" --namespace "$(K8S_NAMESPACE)" 2>/dev/null || true

_k8s-deploy: _k8s-cluster-create _k8s-load _helm-upgrade
	@kubectl wait --for=condition=complete "job/$(HELM_RELEASE)-db-migrate" \
		--namespace "$(K8S_NAMESPACE)" --timeout=120s 2>/dev/null || true
	@echo ""
	@echo "=== Pods ==="
	@kubectl get pods --namespace "$(K8S_NAMESPACE)"
	@echo ""
	@echo "Add to /etc/hosts:  127.0.0.1  $(K8S_HOST)"
	@echo "Open http://$(K8S_HOST)"

_k8s-destroy: _helm-uninstall _k8s-cluster-delete
