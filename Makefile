.PHONY: verify frontend backend clean-release

verify:
        bash scripts/verify-project.sh

frontend:
        npm ci
        npm run lint
        npm run type-check
        npm run test -- --run
        npm run build

backend:
        cd backend && python -m pip install --upgrade pip && pip install -r requirements.txt && pytest -q

clean-release:
        bash scripts/prepare-release.sh

docker-up:
        docker compose up -d postgres redis
        sleep 5

test:e2e: docker-up
        npx playwright install --with-deps 2>/dev/null || npx playwright install
        npx playwright test
