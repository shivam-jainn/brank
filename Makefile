DEV_COMPOSE  := compose-dev.yml
PROD_COMPOSE := compose.yml
COMPOSE      := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

## ─── Production (compose.yml, no profiles) ───────────────────────────

.PHONY: up
up: ## Start the full stack
	$(COMPOSE) -f $(PROD_COMPOSE) up --build -d

.PHONY: down
down: ## Stop the full stack
	$(COMPOSE) -f $(PROD_COMPOSE) down

.PHONY: logs
logs: ## Tail logs for the full stack
	$(COMPOSE) -f $(PROD_COMPOSE) logs -f

.PHONY: ps
ps: ## List running containers
	$(COMPOSE) -f $(PROD_COMPOSE) ps

## ─── Development (compose-dev.yml, profiles) ─────────────────────────
## Usage: make dev ia      -> infra + app
##        make dev iaw      -> infra + app + workers
##        make dev all      -> everything
##        make dev i        -> infra only
## Letters: i=infra  a=app  w=workers   (order/repeats don't matter)

# Turn the arg (e.g. "iaw" or "all") into "--profile infra --profile app ..."
ARG      := $(filter-out dev,$(MAKECMDGOALS))
ifeq ($(ARG),all)
PROFILES := --profile infra --profile app --profile workers
else
PROFILES := $(if $(findstring i,$(ARG)),--profile infra,) \
            $(if $(findstring a,$(ARG)),--profile app,) \
            $(if $(findstring w,$(ARG)),--profile workers,)
endif

.PHONY: dev
dev: ## Start dev services by combo, e.g. `make dev ia`, `make dev iaw`, `make dev all`
	@if [ -z "$(strip $(PROFILES))" ]; then \
		echo "usage: make dev <combo>  (letters i=infra a=app w=workers, or 'all')"; \
		echo "example: make dev ia"; exit 1; \
	fi
	$(COMPOSE) -f $(DEV_COMPOSE) $(PROFILES) up --build -d

.PHONY: dev-down
dev-down: ## Stop all dev services (all profiles)
	$(COMPOSE) -f $(DEV_COMPOSE) --profile infra --profile app --profile workers down

.PHONY: dev-logs
dev-logs: ## Tail dev logs
	$(COMPOSE) -f $(DEV_COMPOSE) logs -f

# Swallow the combo arg so make doesn't treat it as a real target
ifneq ($(ARG),)
$(ARG):
	@:
endif

## ─── Cleanup ─────────────────────────────────────────────────────────

.PHONY: clean
clean: ## Stop everything and remove volumes
	$(COMPOSE) -f $(PROD_COMPOSE) down -v
	$(COMPOSE) -f $(DEV_COMPOSE) --profile infra --profile app --profile workers down -v
