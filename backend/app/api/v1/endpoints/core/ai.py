from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any
from app.core.security import get_current_user

router = APIRouter()

class AIRequest(BaseModel):
    lesson_id: str
    type: str

@router.post("/generate/")
def generate_ai_content(req: AIRequest, current_user: dict = Depends(get_current_user)):
    # Mock AI response for now to ensure front-end works
    # In production, this would call OpenAI/Gemini
    if req.type == "SUMMARY":
        return {"content": "Résumé généré par IA pour la leçon " + req.lesson_id}
    elif req.type == "QUIZ":
        return {
            "title": "Quiz sur la leçon",
            "questions": [
                {
                    "question_text": "Question 1 générée par IA?",
                    "options": ["A", "B", "C", "D"],
                    "correct_answer": "A",
                    "points": 1
                }
            ]
        }
    return {"error": "Unknown type"}
