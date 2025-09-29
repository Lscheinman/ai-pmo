# backend/seeder.py
import random
from typing import Dict
from datetime import timedelta
from faker import Faker
from sqlalchemy.orm import Session
from db import models

fake = Faker()

# Define the structured HUMINT tags
HUMINT_TAG_CATEGORIES = {
    "Personality Traits": [
        "Openness-High", "Openness-Low", "Conscientiousness-High", "Conscientiousness-Low",
        "Extraversion-High", "Introversion", "Agreeableness-High", "Disagreeableness",
        "Neuroticism-High", "Emotionally Stable"
    ],
    "Cognitive Style": [
        "Analytical", "Strategic Thinker", "Detail-Oriented", "Big Picture Thinker",
        "Concrete Thinker", "Abstract Thinker"
    ],
    "Stress Response": [
        "Composed Under Pressure", "Avoidant Under Stress", "Reactive / Impulsive", "Strategic Under Crisis"
    ],
    "Moral Orientation": [
        "Utilitarian", "Deontological", "Opportunistic", "Idealistic", "Pragmatic"
    ],
    "Reliability Score": [
        f"Reliability: {i}" for i in range(1, 11)
    ],
    "Access Level": [
        "Access: Target Organization Insider", "Access: Peripheral Observer",
        "Access: Government Official", "Access: Digital Communications Only"
    ],
    "Source Control": [
        "Fully Controlled", "Semi-Cooperative", "Unknown Control Level", "Double Agent Suspected"
    ],
    "Motivation": [
        "Financially Motivated", "Ideologically Aligned", "Blackmailed / Coerced",
        "Revenge-Driven", "Altruistic / Civic Duty", "Status-Seeking"
    ],
    "Reporting Pattern": [
        "Frequent and Regular", "Irregular", "Event-Triggered", "Ghost / Sporadic", "Consistently Late"
    ],
    "Influence Type": [
        "Direct Authority", "Trusted Advisor", "Social Hub", "Silent Influencer",
        "Public Persona", "Behind-the-Scenes Operator"
    ],
    "Organizational Role": [
        "Decision Maker", "Gatekeeper", "Staff Officer", "Analyst", "Enabler", "Contractor / External Agent"
    ],
    "Collaboration Style": [
        "Works Well in Teams", "Prefers Autonomy", "Conflicts with Peers", "Mentor Role", "Needs Supervision"
    ],
    "Behavioral Indicators": [
        "Disinformation Risk", "Self-Promotion Tendencies", "Conceals Key Facts",
        "Evasive Under Questioning", "Often Overclaims", "Credibility Confirmed by Third Parties"
    ],
    "Mission / Business Role": [
        "Program Manager", "Procurement Officer", "Cybersecurity Lead",
        "Mission Planner", "Legal Oversight", "Finance Liaison"
    ]
}

# Flatten to a single list of tags
HUMINT_TAGS = [tag for category in HUMINT_TAG_CATEGORIES.values() for tag in category]

BUSINESS_TAG_CATEGORIES = {
    "Priority & Impact": [
        "Urgent",
        "High Priority",
        "Low Priority",
        "Business Critical",
        "Revenue Generating",
        "Cost Reduction",
        "Regulatory Deadline",
        "Backlogged"
    ],
    "Project Phase": [
        "Discovery",
        "Planning",
        "Design",
        "Execution",
        "Testing",
        "Deployment",
        "Optimization",
        "Post-Mortem"
    ],
    "Task Type": [
        "Research",
        "Documentation",
        "Development",
        "Testing",
        "Review",
        "Approval",
        "Outreach",
        "Meeting",
        "Negotiation",
        "Integration",
        "Procurement"
    ],
    "Project Type": [
        "New Product Development",
        "Market Expansion",
        "Process Improvement",
        "System Upgrade",
        "Compliance Initiative",
        "Strategic Partnership",
        "Customer Experience",
        "Digital Transformation",
        "Infrastructure Migration",
        "AI/ML Implementation"
    ],
    "Risk Level": [
        "High Risk",
        "Medium Risk",
        "Low Risk",
        "Strategic Risk",
        "Operational Risk",
        "Compliance Risk",
        "Reputation Risk",
        "Tech Debt Risk"
    ],
    "Functional Area": [
        "Engineering",
        "Product",
        "Marketing",
        "Sales",
        "Finance",
        "Legal",
        "HR",
        "Operations",
        "IT",
        "Strategy"
    ],
    "Timeframe & Recurrence": [
        "One-Off",
        "Recurring",
        "Quarterly Goal",
        "Sprint Task",
        "Weekly Objective",
        "Timeboxed"
    ],
    "Stakeholder & Ownership": [
        "Cross-functional",
        "Internal Only",
        "External Vendor",
        "C-Level Sponsor",
        "Customer-Facing",
        "Partner-Dependent"
    ],
    "Status & Health": [
        "On Track",
        "At Risk",
        "Off Track",
        "Blocked",
        "Pending Review",
        "In Progress",
        "Completed"
    ],
    "Strategic Alignment": [
        "OKR-Aligned",
        "ESG Initiative",
        "Innovation Focused",
        "Cost Optimization",
        "Compliance Driven",
        "Customer Retention",
        "Market Differentiation",
        "Internal Capability Building"
    ],
    "Compliance & Security": [
        "GDPR Relevant",
        "SOC 2 Requirement",
        "Data Privacy",
        "Financial Audit",
        "Intellectual Property",
        "Vendor Risk"
    ],
    "Tech Stack / Platform": [
        "SAP",
        "Salesforce",
        "Jira",
        "ServiceNow",
        "Microsoft 365",
        "AWS",
        "Azure",
        "GCP",
        "Custom Platform"
    ]
}

BUSINESS_TAGS = [tag for category in BUSINESS_TAG_CATEGORIES.values() for tag in category]

PERSON_RELATION_TYPES = [
    # Direct Hierarchy & Authority
    ("manages", 3),
    ("reports_to", 3),
    ("delegates_to", 2),
    ("mentors", 3),
    ("commands", 4),          # useful for military-style orgs

    # Peer Dynamics
    ("works_with", 2),
    ("collaborates_with", 2),
    ("peer_of", 1),
    ("competes_with", 2),     # rivalry or tension

    # Influence & Persuasion
    ("influences", 3),
    ("advises", 2),
    ("depends_on", 2),
    ("defers_to", 2),
    ("follows", 2),
    ("supports", 2),
    ("shadows", 1),

    # Trust & Relationship Quality
    ("trusts", 2),
    ("distrusts", -2),
    ("confides_in", 3),
    ("respects", 2),
    ("is_loyal_to", 3),
    ("has_conflict_with", -3),

    # Social/Informal Dynamics
    ("friends_with", 1),
    ("acquainted_with", 1),
    ("family_of", 2),
    ("romantically_involved", 4),
    ("avoids", -1),

    # Professional Dependency
    ("reviews_work_of", 2),
    ("approves_budget_for", 3),
    ("shared_objectives_with", 2),
    ("knowledge_transfer_to", 2),

    # Covert/Contextual
    ("controls", 4),
    ("monitors", 3),
    ("blackmails", 5),
    ("coerces", 4),
    ("recruited", 4)
]

RACI_ROLES = ["Responsible", "Accountable", "Consulted", "Informed"]

ALL_TAGS = BUSINESS_TAGS + HUMINT_TAGS

def seed_intelligence_tags(db: Session):
    count = 0
    for tag_name in ALL_TAGS:
        existing = db.query(models.Tag).filter_by(name=tag_name).first()
        if not existing:
            try:
                tag = models.Tag(name=tag_name)
                db.add(tag)
                db.commit()
                count += 1
            except Exception as e:
                print(f"Error adding tag '{tag_name}': {e}")
    print("✅ Seeded intelligence and personality tags.")
    return count

def seed_person_relationships(db: Session) -> int:
    people = db.query(models.Person).all()
    count = 0

    if len(people) < 2:
        return 0

    for i, person_a in enumerate(people):
        for j, person_b in enumerate(people):
            if i != j and random.random() < 0.2:
                rel_type, weight = random.choice(PERSON_RELATION_TYPES)
                db.add(models.PersonRelationship(
                    source_person_id=person_a.id,
                    target_person_id=person_b.id,
                    relationship_type=rel_type,
                    weight=weight
                ))
                count += 1

    db.commit()
    print(f"✅ Seeded {count} person-to-person relationships.")
    return count


def seed_tags_to_people_and_projects(db: Session) -> Dict[str, int]:
    tags = db.query(models.Tag).all()
    people = db.query(models.Person).all()
    projects = db.query(models.Project).all()

    if not tags:
        print("⚠️ No tags to assign.")
        return {"people": 0, "projects": 0}

    for person in people:
        person.tags = random.sample(tags, min(3, len(tags)))

    for project in projects:
        project.tags = random.sample(tags, min(3, len(tags)))

    db.commit()
    print(f"✅ Assigned tags to {len(people)} people and {len(projects)} projects.")
    return {"people": len(people), "projects": len(projects)}


def seed_tasks_with_raci(db: Session) -> int:
    projects = db.query(models.Project).all()
    people = db.query(models.Person).all()
    tags = db.query(models.Tag).all()
    task_count = 0

    if not projects or not people:
        print("❌ No projects or people found.")
        return 0

    for project in projects:
        num_tasks = random.randint(2, 5)
        for i in range(num_tasks):
            task_name = f"{random.choice(['Recon', 'Briefing', 'Surveillance', 'Debrief', 'Prep'])} {i + 1} - {project.name}"
            start = fake.date_between(start_date='-30d', end_date='today')
            end = start + timedelta(days=random.randint(3, 15))

            task = models.Task(
                name=task_name,
                description=fake.paragraph(nb_sentences=3),
                type="task",
                start=start,
                end=end,
                project_id=project.id,
                priority=random.choice(["high", "medium", "low"]),
                status=random.choice(["not started", "in progress", "completed"])
            )
            db.add(task)
            db.flush()
            task_count += 1

            assigned_people = random.sample(people, min(4, len(people)))
            for person, role in zip(assigned_people, RACI_ROLES):
                db.add(models.TaskAssignee(
                    task_id=task.id,
                    person_id=person.id,
                    role=role
                ))

            if tags:
                task.tags = random.sample(tags, min(3, len(tags)))

    db.commit()
    print(f"✅ Created {task_count} tasks with RACI roles and tags.")
    return task_count

def seed_all(db: Session):
    report = {}
    report['tags'] = seed_intelligence_tags(db)
    report['people_to_projects'] = seed_tags_to_people_and_projects(db)
    report['tasks'] = seed_tasks_with_raci(db)
    report['person_relations'] = seed_person_relationships(db)
    return report

# Call from FastAPI via an endpoint or CLI
