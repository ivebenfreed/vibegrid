---
id: vibegrid-smoke
name: "VIbeGrid Smoke Test"
description: "Systematic VIbeGrid feature coverage driven by feature docs — renderers, interactions, view modes, regressions"
mode: vibegrid-smoke
workflow_prefix: "VG"

phases:
  - id: p0
    name: Setup
    stage: setup
    task_config:
      title: "P0: Setup - auth, dev server, read feature docs, build test plan"
      labels: [setup]
    steps:
      - id: start-dev-server
        $ref: start-dev-server
      - id: setup-and-plan
        title: "Setup environment and build test plan from feature docs"
        skill: vibegrid-smoke

  - id: p1
    name: Execute & Fix
    stage: work
    expansion: agent
    skill: vibegrid-smoke
    task_config:
      title: "P1: Work - test every behavior, fix failures"
      labels: [execution, work]
      depends_on: [p0]
    agent_protocol:
      max_tasks: 100
      require_labels: [vg-test]

  - id: p2
    name: Report
    stage: close
    task_config:
      title: "P2: Close - compile coverage matrix, commit evidence"
      labels: [evidence, close]
      depends_on: [p1]
    steps:
      - id: compile-and-compare
        title: "Compile results and regression diff"
        skill: vibegrid-smoke
      - id: commit-push
        $ref: commit-push

global_conditions:
  - changes_committed
  - changes_pushed

workflow_id_format: "VG-{session_last_4}-{MMDD}"
---
