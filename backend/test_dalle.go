package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
)

// DalleResponse defines the expected structure of the OpenAI response.
type DalleResponse struct {
	Data []struct {
		Url string `json:"url"`
	} `json:"data"`
}

func generateDalleImage(prompt string) (string, error) {
	// Hard-code your API key (for testing only; not recommended for production)
	apiKey := "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"
	if apiKey == "" {
		return "", errors.New("missing OpenAI API key")
	}

	// Prepare the request payload.
	reqBody, err := json.Marshal(map[string]interface{}{
		"prompt": prompt,
		"n":      1,
		"size":   "1024x1024",
	})
	if err != nil {
		return "", err
	}

	// Create the HTTP request.
	req, err := http.NewRequest("POST", "https://api.openai.com/v1/images/generations", bytes.NewBuffer(reqBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	// Check for a non-200 response.
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("non-200 response: %d, body: %s", resp.StatusCode, string(body))
	}

	var dalleResp DalleResponse
	if err := json.Unmarshal(body, &dalleResp); err != nil {
		return "", err
	}
	if len(dalleResp.Data) == 0 {
		return "", errors.New("no image generated")
	}

	// Return the absolute URL provided by the API.
	return dalleResp.Data[0].Url, nil
}

func main() {
	prompt := "A futuristic cityscape at sunset"
	imageURL, err := generateDalleImage(prompt)
	if err != nil {
		log.Fatalf("Error generating image: %v", err)
	}
	fmt.Println("Generated image URL:", imageURL)
}
