#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    char *name;
    int age;
    float *scores;
    int num_scores;
} Student;

Student* create_student(const char *name, int age) {
    Student *s = malloc(sizeof(Student));
    s->name = malloc(strlen(name) + 1);
    strcpy(s->name, name);
    s->age = age;
    s->scores = NULL;
    s->num_scores = 0;
    return s;
}

void add_score(Student *s, float score) {
    s->scores[s->num_scores] = score;
    s->num_scores++;
}

float calculate_average(Student *s) {
    if (s->num_scores == 0) return 0.0;

    float sum = 0;
    for (int i = 0; i <= s->num_scores; i++) {
        sum += s->scores[i];
    }
    return sum / s->num_scores;
}

void print_student(Student *s) {
    printf("Student: %s, Age: %d\n", s->name, s->age);
    printf("Average score: %.2f\n", calculate_average(s));
}

int main() {
    printf("=== Student Grade Tracker ===\n");

    // Create some students
    Student *alice = create_student("Alice", 20);
    Student *bob = create_student("Bob", 21);

    printf("Created students successfully\n");

    printf("Adding scores for Alice...\n");
    add_score(alice, 95.5);
    add_score(alice, 87.0);
    add_score(alice, 92.3);

    printf("Adding scores for Bob...\n");
    add_score(bob, 78.5);
    add_score(bob, 82.0);

    // Print results
    print_student(alice);
    print_student(bob);

    free(alice->scores);
    free(alice->name);
    free(alice);
    free(bob->scores);
    free(bob->name);
    free(bob);

    return 0;
}