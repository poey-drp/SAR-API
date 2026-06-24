# app/faq_generator.py

from typing import List, Dict, Any
from pydantic import BaseModel, Field
from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_community.callbacks import get_openai_callback
from app.prompts import get_faq_extraction_system_prompt, get_question_expansion_system_prompt, get_rule_faq_cleaning_system_prompt

# Pydantic schemas for structured extraction
class FAQPair(BaseModel):
    category: str = Field(..., description="Appropriate general topic or category name")
    question: str = Field(..., description="Clear, self-contained and grammatically complete question")
    answer: str = Field(..., description="Detailed answer matching the facts in the text")

class FAQExtractionResult(BaseModel):
    faqs: List[FAQPair]

class QuestionExpansionResult(BaseModel):
    variations: List[str]

def chunk_text(text: str, chunk_size: int = 2000, overlap: int = 500) -> List[str]:
    """Chunks text into sizes of chunk_size with some overlap."""
    if not text:
        return []
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks

def extract_faqs_from_text_stream(text: str, filename: str, language: str = "Thai", num_questions: int = 10):
    """
    Generator version of FAQ extraction. Yields progress events as it processes
    each chunk, and finally yields a single event of type "extract_done" carrying
    the full list of FAQs and the accumulated cost.

    Event shapes:
        {"type": "chunked", "total_chunks": N}
        {"type": "progress", "stage": "extracting", "current": i, "total": N}
        {"type": "extract_done", "faqs": [...], "cost": float}

    Note for Developer Team:
    You can easily replace the LLM call inside this function with your team's
    custom logic or fine-tuned model. The "extract_done" event must carry a list
    of dicts: [{"category": "...", "question": "...", "answer": "..."}, ...]
    """
    print(f"[FAQ Generator] Starting extraction for {filename} (Length: {len(text)} chars)")

    # 1. Chunk the text if it exceeds context/optimal processing limits
    # We use 5000 chars as specified (approx 1200-1500 tokens in Thai)
    chunks = chunk_text(text, chunk_size=5000, overlap=500)
    print(f"[FAQ Generator] Chunked text into {len(chunks)} chunks")
    yield {"type": "chunked", "total_chunks": len(chunks)}

    # 2. Setup the LLM with structured output
    try:
        from app.config import OPENAI_API_KEY
        # Initialize GPT-4o-mini with explicit API key
        llm = init_chat_model("gpt-4o-mini", model_provider="openai", openai_api_key=OPENAI_API_KEY)
        structured_llm = llm.with_structured_output(FAQExtractionResult)
    except Exception as e:
        print(f"[FAQ Generator] Error initializing LLM: {e}. Falling back to empty lists.")
        yield {"type": "extract_done", "faqs": [], "cost": 0.0}
        return

    extracted_faqs = []
    total_cost = 0.0

    # Calculate how many questions to ask per chunk to hit the total target
    target_per_chunk = max(1, (num_questions // len(chunks)) + 1)

    # 3. Process each chunk
    for i, chunk in enumerate(chunks):
        print(f"[FAQ Generator] Processing chunk {i+1}/{len(chunks)}...")
        yield {"type": "progress", "stage": "extracting", "current": i + 1, "total": len(chunks)}
        try:
            system_prompt = get_faq_extraction_system_prompt(language=language, num_questions=target_per_chunk)
            with get_openai_callback() as cb:
                result = structured_llm.invoke([
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=f"Document Source: {filename}\n\nContent Chunk:\n{chunk}")
                ])
                total_cost += cb.total_cost

            # Append generated FAQs
            for item in result.faqs:
                extracted_faqs.append({
                    "category": item.category.strip(),
                    "question": item.question.strip(),
                    "answer": item.answer.strip(),
                    "filename": filename,
                    "source_type": "LLM"
                })
        except Exception as e:
            print(f"[FAQ Generator] Error extracting from chunk {i+1}: {e}")
            continue

    # Strictly enforce the target question count
    extracted_faqs = extracted_faqs[:num_questions]

    print(f"[FAQ Generator] Finished extraction. Generated {len(extracted_faqs)} FAQ pairs.")
    print(f"[FAQ Generator] Extraction Cost (USD): ${total_cost:.4f}")
    yield {"type": "extract_done", "faqs": extracted_faqs, "cost": total_cost}


def extract_faqs_from_text(text: str, filename: str, language: str = "Thai", num_questions: int = 10):
    """
    Backward-compatible wrapper that drains extract_faqs_from_text_stream and
    returns (faqs, total_cost). Use extract_faqs_from_text_stream directly when
    you need live progress events.
    """
    faqs, cost = [], 0.0
    for ev in extract_faqs_from_text_stream(text, filename, language, num_questions):
        if ev["type"] == "extract_done":
            faqs, cost = ev["faqs"], ev["cost"]
    return faqs, cost

def expand_faq_questions_stream(faqs: List[Dict[str, str]], language: str = "Thai"):
    """
    Generator version of question expansion. Yields a progress event before each
    FAQ is expanded, and finally a single "expand_done" event carrying the full
    expanded list (original + variations) and the total cost.

    Yields:
        {"type": "progress", "stage": "expanding", "current": i, "total": N}
        ...
        {"type": "expand_done", "faqs": [...], "cost": float}
    """
    print(f"[FAQ Generator] Starting question expansion for {len(faqs)} FAQs...")

    try:
        from app.config import OPENAI_API_KEY
        llm = init_chat_model("gpt-4o-mini", model_provider="openai", openai_api_key=OPENAI_API_KEY)
        structured_llm = llm.with_structured_output(QuestionExpansionResult)
    except Exception as e:
        print(f"[FAQ Generator] Error initializing LLM for expansion: {e}")
        yield {"type": "expand_done", "faqs": faqs, "cost": 0.0}
        return

    expanded_faqs = []
    total_cost = 0.0
    system_prompt = get_question_expansion_system_prompt(language=language)

    for i, faq in enumerate(faqs):
        print(f"[FAQ Generator] Expanding question {i+1}/{len(faqs)}...")
        yield {"type": "progress", "stage": "expanding", "current": i + 1, "total": len(faqs)}
        expanded_faqs.append(faq)  # Always keep the original
        try:
            with get_openai_callback() as cb:
                result = structured_llm.invoke([
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=f"Original Question:\n{faq['question']}")
                ])
                total_cost += cb.total_cost

            for variation in result.variations:
                expanded_faqs.append({
                    "category": faq["category"],
                    "question": variation.strip(),
                    "answer": faq["answer"],
                    "filename": faq.get("filename", ""),
                    "original_question": faq.get("original_question", faq["question"]),
                    "source_type": faq.get("source_type", "LLM")
                })
        except Exception as e:
            print(f"[FAQ Generator] Error expanding question {i+1}: {e}")
            continue

    print(f"[FAQ Generator] Finished expansion. Total pairs now: {len(expanded_faqs)}.")
    print(f"[FAQ Generator] Expansion Cost (USD): ${total_cost:.4f}")
    yield {"type": "expand_done", "faqs": expanded_faqs, "cost": total_cost}


def expand_faq_questions(faqs: List[Dict[str, str]], language: str = "Thai") -> tuple[List[Dict[str, str]], float]:
    """
    Backward-compatible wrapper that drains expand_faq_questions_stream and returns
    (expanded_faqs, total_cost). Use expand_faq_questions_stream directly when you
    need live progress events.
    """
    expanded_faqs, total_cost = faqs, 0.0
    for ev in expand_faq_questions_stream(faqs, language):
        if ev["type"] == "expand_done":
            expanded_faqs = ev["faqs"]
            total_cost = ev["cost"]
    return expanded_faqs, total_cost

def clean_rule_faqs_stream(faqs: List[Dict[str, str]], language: str = "Thai"):
    """
    Generator version of rule-based FAQ cleaning. Yields batch progress events
    and finally a "clean_done" event carrying the cleaned FAQs and cost.

    Event shapes:
        {"type": "progress", "stage": "cleaning", "current": i, "total": N}
        {"type": "clean_done", "faqs": [...], "cost": float}
    """
    if not faqs:
        yield {"type": "clean_done", "faqs": [], "cost": 0.0}
        return

    print(f"[FAQ Generator] Starting rule-based FAQ cleaning for {len(faqs)} FAQs...")

    try:
        from app.config import OPENAI_API_KEY
        llm = init_chat_model("gpt-4o-mini", model_provider="openai", openai_api_key=OPENAI_API_KEY)
        structured_llm = llm.with_structured_output(FAQExtractionResult)
    except Exception as e:
        print(f"[FAQ Generator] Error initializing LLM for rule cleaning: {e}")
        yield {"type": "clean_done", "faqs": faqs, "cost": 0.0}
        return

    cleaned_faqs = []
    total_cost = 0.0
    system_prompt = get_rule_faq_cleaning_system_prompt(language=language)

    # Process in batches to avoid context limit issues
    batch_size = 20
    total_batches = (len(faqs) + batch_size - 1) // batch_size
    for i in range(0, len(faqs), batch_size):
        batch = faqs[i:i + batch_size]
        batch_no = i // batch_size + 1
        print(f"[FAQ Generator] Cleaning batch {batch_no} ({len(batch)} items)...")
        yield {"type": "progress", "stage": "cleaning", "current": batch_no, "total": total_batches}

        batch_text = ""
        for j, faq in enumerate(batch):
            batch_text += f"Item {j+1}:\n"
            batch_text += f"Category: {faq.get('category', '')}\n"
            batch_text += f"Question: {faq.get('question', '')}\n"
            batch_text += f"Answer: {faq.get('answer', '')}\n"
            batch_text += f"Filename: {faq.get('filename', '')}\n\n"

        try:
            with get_openai_callback() as cb:
                result = structured_llm.invoke([
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=f"Rule-Based FAQs to Clean:\n\n{batch_text}")
                ])
                total_cost += cb.total_cost

            for item in result.faqs:
                cleaned_faqs.append({
                    "category": item.category.strip(),
                    "question": item.question.strip(),
                    "answer": item.answer.strip(),
                    # Attempt to preserve original filename if LLM doesn't change it much, else use first item's filename
                    "filename": batch[0].get('filename', 'Unknown'),
                    "source_type": "Rule-based (Cleaned)"
                })
        except Exception as e:
            print(f"[FAQ Generator] Error cleaning batch {batch_no}: {e}")
            # Fallback: keep original if cleaning fails
            cleaned_faqs.extend(batch)
            continue

    print(f"[FAQ Generator] Finished rule cleaning. Total clean pairs: {len(cleaned_faqs)}.")
    print(f"[FAQ Generator] Cleaning Cost (USD): ${total_cost:.4f}")
    yield {"type": "clean_done", "faqs": cleaned_faqs, "cost": total_cost}


def clean_rule_faqs(faqs: List[Dict[str, str]], language: str = "Thai") -> tuple[List[Dict[str, str]], float]:
    """
    Backward-compatible wrapper that drains clean_rule_faqs_stream and returns
    (cleaned_faqs, total_cost).
    """
    cleaned, cost = [], 0.0
    for ev in clean_rule_faqs_stream(faqs, language):
        if ev["type"] == "clean_done":
            cleaned, cost = ev["faqs"], ev["cost"]
    return cleaned, cost

