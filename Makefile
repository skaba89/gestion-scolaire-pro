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
