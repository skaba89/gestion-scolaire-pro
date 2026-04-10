# To run tests:
# 1. Install pytest and pytest-mock: pip install pytest pytest-mock
# 2. From the root of the project, run: pytest

import pytest
from backend.generator import L1Generator

import openai

def test_generate_biography_with_mock_api(mocker):
    """
    Tests the generate_biography method, mocking the OpenAI API call.
    """
    # 1. Arrange
    # Mock the OpenAI class to return a mock client
    mock_client = mocker.Mock()
    mock_response = mocker.Mock()
    mock_response.choices = [mocker.Mock()]
    mock_response.choices[0].text = "This is a test biography."
    mock_client.completions.create.return_value = mock_response

    mocker.patch(
        'backend.generator.openai.OpenAI',
        return_value=mock_client
    )

    # Instantiate the generator
    # We can use a fake API key because the call is mocked
    generator = L1Generator(openai_api_key="fake_key")
    
    # Placeholder L0 data
    l0_data = {"notes": ["some note"]}

    # 2. Act
    biography = generator.generate_biography(l0_data)

    # 3. Assert
    assert biography == "This is a test biography."
    # We can also assert that the mocked method was called
    mock_client.completions.create.assert_called_once()
